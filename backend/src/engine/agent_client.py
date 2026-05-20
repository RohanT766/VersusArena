"""Multi-step agent client with provider tool calling."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from src.benchmark.cost_estimate import estimate_cost_usd
from src.utils.common import LLMClient


@dataclass
class AgentTurnResult:
    """Result of one agent turn (may include multiple tool calls)."""

    action_name: str
    action_args: Dict[str, Any]
    reasoning: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    tool_calls_count: int = 0
    tools_used: List[str] = field(default_factory=list)


def _terminal_tool_names(tools: List[Dict[str, Any]]) -> set:
    return {t["name"] for t in tools if t.get("terminal")}


def _primary_terminal_tool(tools: List[Dict[str, Any]]) -> Optional[str]:
    """Return the sole terminal action tool name, if there is exactly one."""
    names = [t["name"] for t in tools if t.get("terminal")]
    if len(names) == 1:
        return names[0]
    return names[-1] if names else None


def _tool_choice_for_step(
    model_type: str,
    *,
    step: int,
    max_steps: int,
    terminal_tool: Optional[str],
    has_tools: bool,
) -> Optional[Dict[str, Any]]:
    if not has_tools:
        return None
    late = max_steps >= 2 and step >= max_steps - 2
    if model_type == "ANTHROPIC":
        if terminal_tool and late:
            return {"type": "tool", "name": terminal_tool}
        if step == 0:
            return {"type": "any"}
        return None
    if model_type == "OPENAI":
        if terminal_tool and late:
            return {"type": "function", "function": {"name": terminal_tool}}
        return None
    return None


def _openai_tools(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in tools
    ]


def _anthropic_tools(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["parameters"],
        }
        for t in tools
    ]


def _google_tools(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    decls = []
    for t in tools:
        decls.append(
            {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            }
        )
    return decls


def _parse_json_args(raw: Any) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


# Default observe → act budget for arena games (observation tool + terminal action + retries).
ARENA_AGENT_MAX_STEPS = 8


class AgentClient:
    """Runs observe → act loops with structured tool calls."""

    def __init__(self, model_id: str):
        self._llm = LLMClient(model_id)
        self.model_type = self._llm.model_type
        self.model_name = self._llm.model_name
        self.client = self._llm.client

    def run_turn(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict[str, Any]],
        tool_executor: Callable[[str, Dict[str, Any]], Any],
        *,
        max_steps: int = 5,
        max_tokens: int = 512,
        temperature: float = 0.3,
        usage_out: Optional[Dict[str, Any]] = None,
        system: Optional[str] = None,
    ) -> AgentTurnResult:
        if os.getenv("ARENA_STUB_AGENT") == "1":
            return _stub_run_turn(tools, tool_executor, usage_out)

        tool_log: List[Dict[str, Any]] = []
        tools_used: List[str] = []
        total_latency = 0.0
        total_in = 0
        total_out = 0
        total_cost = 0.0
        last_error: Optional[str] = None

        msgs = list(messages)
        api_system = system
        if system and self.model_type == "OPENAI":
            msgs = [{"role": "system", "content": system}] + msgs
            api_system = None

        terminal = _terminal_tool_names(tools)
        force_terminal = _primary_terminal_tool(tools)

        for step in range(max_steps):
            step_usage: Dict[str, Any] = {}
            tool_choice = _tool_choice_for_step(
                self.model_type,
                step=step,
                max_steps=max_steps,
                terminal_tool=force_terminal,
                has_tools=bool(tools),
            )
            try:
                text, calls = self._invoke_with_tools(
                    msgs,
                    tools,
                    max_tokens,
                    temperature,
                    step_usage,
                    system=api_system,
                    tool_choice=tool_choice,
                )
            except Exception as e:
                last_error = str(e)
                break

            total_latency += step_usage.get("latency_ms") or 0
            total_in += step_usage.get("input_tokens") or 0
            total_out += step_usage.get("output_tokens") or 0
            total_cost += step_usage.get("cost_usd") or 0

            if calls:
                if self.model_type == "OPENAI":
                    assistant_msg: Dict[str, Any] = {
                        "role": "assistant",
                        "content": text or None,
                        "tool_calls": calls,
                    }
                    msgs.append(assistant_msg)
                elif self.model_type == "ANTHROPIC":
                    content_blocks = []
                    if text:
                        content_blocks.append({"type": "text", "text": text})
                    for c in calls:
                        content_blocks.append(c)
                    msgs.append({"role": "assistant", "content": content_blocks})
                else:
                    msgs.append({"role": "model", "parts": calls})

                for call in calls:
                    name, args = self._extract_call(call)
                    if not name:
                        continue
                    tools_used.append(name)
                    try:
                        result = tool_executor(name, args)
                    except Exception as ex:
                        result = {"error": str(ex)}

                    preview = result
                    if isinstance(result, dict) and result.get("__terminal__"):
                        preview = {k: v for k, v in result.items() if k != "__terminal__"}
                        tool_log.append(
                            {"name": name, "args": args, "result_preview": _preview(preview)}
                        )
                        if usage_out is not None:
                            usage_out["latency_ms"] = total_latency
                            usage_out["input_tokens"] = total_in
                            usage_out["output_tokens"] = total_out
                            usage_out["cost_usd"] = total_cost
                            usage_out["error"] = last_error
                            usage_out["tool_calls_count"] = len(tool_log)
                            usage_out["tools_used"] = ",".join(tools_used)
                        return AgentTurnResult(
                            action_name=name,
                            action_args=args,
                            reasoning=text or "",
                            tool_calls=tool_log,
                            tool_calls_count=len(tool_log),
                            tools_used=tools_used,
                        )

                    tool_log.append(
                        {"name": name, "args": args, "result_preview": _preview(result)}
                    )
                    self._append_tool_result(msgs, call, name, result)

                continue

            if text:
                for tname in terminal:
                    parsed = _fallback_parse_terminal(tname, text)
                    if parsed is not None:
                        if usage_out is not None:
                            _fill_usage_out(
                                usage_out, total_latency, total_in, total_out, total_cost, last_error, tool_log, tools_used
                            )
                        return AgentTurnResult(
                            action_name=tname,
                            action_args=parsed,
                            reasoning=text,
                            tool_calls=tool_log,
                            tool_calls_count=len(tool_log),
                            tools_used=tools_used,
                        )

            if step < max_steps - 1:
                tool_hint = force_terminal or "the required action tool"
                msgs.append(
                    {
                        "role": "user",
                        "content": (
                            f"Call `{tool_hint}` now to submit your move. "
                            "Do not respond with plain text only."
                        ),
                    }
                )
                continue
            break

        if usage_out is not None:
            _fill_usage_out(
                usage_out, total_latency, total_in, total_out, total_cost, last_error, tool_log, tools_used
            )
        raise RuntimeError(last_error or "Agent did not produce a terminal tool call")

    def _invoke_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        max_tokens: int,
        temperature: float,
        usage_out: Dict[str, Any],
        *,
        system: Optional[str] = None,
        tool_choice: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[str], List[Any]]:
        t0 = time.time()
        if self.model_type == "OPENAI":
            params: Dict[str, Any] = {
                "model": self.model_name,
                "messages": messages,
                "tools": _openai_tools(tools),
                "tool_choice": tool_choice or "auto",
                "timeout": 60,
            }
            if self._llm._is_new_openai_model():
                params["max_completion_tokens"] = max_tokens
            else:
                params["temperature"] = temperature
                params["max_tokens"] = max_tokens
            response = self.client.chat.completions.create(**params)
            self._llm._fill_usage_openai(usage_out, response, t0)
            msg = response.choices[0].message
            text = (msg.content or "").strip() if msg.content else None
            calls = []
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    calls.append(
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                    )
            return text, calls

        if self.model_type == "ANTHROPIC":
            anthropic_msgs = self._to_anthropic_messages(messages)
            params: Dict[str, Any] = {
                "model": self.model_name,
                "messages": anthropic_msgs,
                "tools": _anthropic_tools(tools),
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if system:
                params["system"] = system
            if tool_choice:
                params["tool_choice"] = tool_choice
            response = self.client.messages.create(**params)
            self._llm._fill_usage_anthropic(usage_out, response, t0)
            text_parts = []
            calls = []
            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    calls.append(
                        {
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        }
                    )
            return ("\n".join(text_parts).strip() or None), calls

        # Google
        import google.generativeai as genai

        gemini_tools = _google_tools(tools)
        model = genai.GenerativeModel(
            self.model_name,
            tools=[{"function_declarations": gemini_tools}] if gemini_tools else None,
        )
        prompt = self._messages_to_prompt(messages)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )
        self._llm._fill_usage_google(usage_out, response, t0)
        text = (getattr(response, "text", None) or "").strip() or None
        calls = []
        for part in response.candidates[0].content.parts:
            fc = getattr(part, "function_call", None)
            if fc:
                args = dict(fc.args) if fc.args else {}
                calls.append(
                    {
                        "function_call": {
                            "name": fc.name,
                            "args": args,
                        }
                    }
                )
        return text, calls

    def _to_anthropic_messages(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for m in messages:
            role = m.get("role", "user")
            if role == "system":
                continue
            if role == "tool":
                block = {
                    "type": "tool_result",
                    "tool_use_id": m.get("tool_call_id", ""),
                    "content": m.get("content", ""),
                }
                if out and out[-1]["role"] == "user" and isinstance(out[-1].get("content"), list):
                    out[-1]["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
                continue
            if (
                out
                and out[-1]["role"] == role
                and role == "user"
                and isinstance(m.get("content"), str)
                and isinstance(out[-1].get("content"), str)
            ):
                out[-1]["content"] = f"{out[-1]['content']}\n\n{m['content']}"
                continue
            out.append(m)
        return out

    def _messages_to_prompt(self, messages: List[Dict[str, Any]]) -> str:
        lines = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if isinstance(content, list):
                content = json.dumps(content, default=str)[:4000]
            lines.append(f"{role.upper()}: {content}")
        lines.append(
            "Use the provided tools. Call a terminal tool when ready to commit your move."
        )
        return "\n\n".join(lines)

    def _extract_call(self, call: Any) -> Tuple[Optional[str], Dict[str, Any]]:
        if isinstance(call, dict):
            if call.get("type") == "function" and "function" in call:
                fn = call["function"]
                return fn.get("name"), _parse_json_args(fn.get("arguments"))
            if call.get("type") == "tool_use":
                return call.get("name"), _parse_json_args(call.get("input"))
            if "function_call" in call:
                fc = call["function_call"]
                return fc.get("name"), _parse_json_args(fc.get("args"))
        return None, {}

    def _append_tool_result(
        self, messages: List[Dict[str, Any]], call: Any, name: str, result: Any
    ) -> None:
        payload = json.dumps(result, default=str) if not isinstance(result, str) else result
        if self.model_type == "OPENAI":
            tid = call.get("id", name)
            messages.append(
                {"role": "tool", "tool_call_id": tid, "content": payload[:8000]}
            )
        elif self.model_type == "ANTHROPIC":
            tid = call.get("id", name)
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": tid, "content": payload[:8000]}
                    ],
                }
            )
        else:
            messages.append({"role": "user", "content": f"Tool {name} result:\n{payload[:8000]}"})


def terminal_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """Mark tool executor result as terminal action for AgentClient."""
    out = dict(data)
    out["__terminal__"] = True
    return out


def _preview(obj: Any, limit: int = 200) -> str:
    s = json.dumps(obj, default=str) if not isinstance(obj, str) else obj
    return s[:limit]


def _fill_usage_out(
    usage_out: Dict[str, Any],
    latency: float,
    inp: int,
    outp: int,
    cost: float,
    error: Optional[str],
    tool_log: List[Dict[str, Any]],
    tools_used: List[str],
) -> None:
    usage_out["latency_ms"] = latency
    usage_out["input_tokens"] = inp
    usage_out["output_tokens"] = outp
    usage_out["cost_usd"] = cost
    usage_out["error"] = error
    usage_out["tool_calls_count"] = len(tool_log)
    usage_out["tools_used"] = ",".join(tools_used)


def _stub_run_turn(
    tools: List[Dict[str, Any]],
    tool_executor: Callable[[str, Dict[str, Any]], Any],
    usage_out: Optional[Dict[str, Any]],
) -> AgentTurnResult:
    """Deterministic agent turn for tests — no API calls."""
    tool_log: List[Dict[str, Any]] = []
    tools_used: List[str] = []
    cache: Dict[str, Any] = {}

    for t in tools:
        if t.get("terminal"):
            continue
        name = t["name"]
        tools_used.append(name)
        result = tool_executor(name, {})
        cache[name] = result
        tool_log.append({"name": name, "args": {}, "result_preview": _preview(result)})

    terminal_tools = [t for t in tools if t.get("terminal")]
    for t in terminal_tools:
        name = t["name"]
        args = _stub_terminal_args(name, cache)
        tools_used.append(name)
        result = tool_executor(name, args)
        tool_log.append({"name": name, "args": args, "result_preview": _preview(result)})
        if isinstance(result, dict) and result.get("__terminal__"):
            if usage_out is not None:
                usage_out["latency_ms"] = 0
                usage_out["input_tokens"] = 0
                usage_out["output_tokens"] = 0
                usage_out["cost_usd"] = 0
                usage_out["error"] = None
                usage_out["tool_calls_count"] = len(tool_log)
                usage_out["tools_used"] = ",".join(tools_used)
                usage_out["tool_calls"] = tool_log
            return AgentTurnResult(
                action_name=name,
                action_args=args,
                reasoning="stub agent",
                tool_calls=tool_log,
                tool_calls_count=len(tool_log),
                tools_used=tools_used,
            )

    raise RuntimeError(f"stub agent: terminal tool did not complete ({[t['name'] for t in terminal_tools]})")


def _stub_terminal_args(name: str, cache: Dict[str, Any]) -> Dict[str, Any]:
    if name == "get_feedback_history":
        return {}
    if name == "submit_guess":
        hist = cache.get("get_feedback_history") or {}
        turn = hist.get("turn", 1)
        return {"word": ("AROSE", "SLATE", "CRANE", "ADIEU", "STORY", "PLANE")[min(turn - 1, 5)]}
    if name == "submit_group":
        rem = cache.get("get_remaining_words") or {}
        words = rem.get("words") or []
        return {"words": words[:4]}
    if name == "fire_shot" or name == "reveal_cell":
        return {"row": 0, "col": 0}
    if name == "place_bid":
        state = cache.get("get_auction_state") or {}
        budget = int(state.get("your_budget") or 50)
        return {"amount": max(0, budget // 4)}
    if name == "take_action":
        state = cache.get("get_hand_state") or {}
        to_call = int(state.get("to_call") or 0)
        if to_call > 0:
            return {"action": "call"}
        return {"action": "check"}
    if name == "place_ships":
        return {"ships": []}
    return {}


def agent_extra_from_usage(usage: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Build benchmark extra_json payload from agent usage dict."""
    if not usage:
        return None
    if not (usage.get("tool_calls_count") or usage.get("tools_used") or usage.get("tool_calls")):
        return None
    return {
        "tool_calls_count": usage.get("tool_calls_count", 0),
        "tools_used": usage.get("tools_used", ""),
        "tool_calls": usage.get("tool_calls", []),
    }


def _fallback_parse_terminal(name: str, text: str) -> Optional[Dict[str, Any]]:
    import re

    t = (text or "").strip()
    if name == "submit_guess":
        w = re.findall(r"[A-Za-z]+", t.upper())
        if w:
            return {"word": max(w, key=len)[:8]}
    if name == "submit_group":
        try:
            data = json.loads(t)
            if isinstance(data, list) and len(data) >= 4:
                return {"words": [str(x).upper() for x in data[:4]]}
        except json.JSONDecodeError:
            pass
        words = re.findall(r"[A-Za-z]+", t.upper())
        if len(words) >= 4:
            return {"words": words[:4]}
    if name == "fire_shot" or name == "reveal_cell":
        m = re.search(r"(\d+)\s*[, ]\s*(\d+)", t)
        if m:
            return {"row": int(m.group(1)), "col": int(m.group(2))}
    if name == "place_bid":
        m = re.search(r"\b(\d+)\b", t)
        if m:
            return {"amount": int(m.group(1))}
    if name == "take_action":
        u = t.upper()
        if "FOLD" in u:
            return {"action": "fold"}
        if "CHECK" in u:
            return {"action": "check"}
        if "CALL" in u:
            return {"action": "call"}
        m = re.search(r"RAISE\s*(\d+)", u)
        if m:
            return {"action": "raise", "amount": int(m.group(1))}
    return None

#!/usr/bin/env python3
"""
Smoke-test every catalog model using the same API paths as arena games.

Modes:
  chat          — LLMClient.get_response (benchmark / simple games)
  wordle        — get_llm_guess (AgentClient + submit_guess tool, production Wordle)
  agent_tool    — AgentClient.run_turn with a minimal terminal tool
  battleship    — LLMClient.get_move (coordinate extraction)
"""

from __future__ import annotations

import argparse
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from dotenv import load_dotenv

load_dotenv(os.path.join(backend_dir, ".env"))

from src.engine.agent_client import ARENA_AGENT_MAX_STEPS, AgentClient, terminal_result
from src.engine.game_tools import wordle_submit_tools
from src.engine.model_registry import CATALOG_MODEL_IDS
from src.games.wordle.wordle_simple import get_llm_guess
from src.utils.common import LLMClient

MODES = ("chat", "wordle", "agent_tool", "battleship")


def verify_chat(model_id: str) -> tuple[bool, str]:
    client = LLMClient(model_id)
    text = client.get_response("Reply with exactly: OK", max_tokens=32, temperature=0.2)
    if not text:
        return False, "empty response"
    return True, text[:40]


def verify_wordle(model_id: str) -> tuple[bool, str]:
    guess, _ = get_llm_guess(
        model_id,
        [],
        [],
        word_len=5,
        hard_mode=False,
    )
    if len(guess) != 5 or not guess.isalpha():
        return False, f"bad guess {guess!r}"
    return True, guess


def verify_agent_tool(model_id: str) -> tuple[bool, str]:
    tools = [
        {
            "name": "submit_guess",
            "description": "Submit exactly one 5-letter uppercase word.",
            "parameters": {
                "type": "object",
                "properties": {
                    "word": {"type": "string", "description": "5 uppercase letters"},
                },
                "required": ["word"],
            },
            "terminal": True,
        }
    ]

    def executor(name: str, args: dict) -> dict:
        if name == "submit_guess":
            w = str(args.get("word", "")).upper().strip()
            if len(w) == 5 and w.isalpha():
                return terminal_result({"word": w})
            return {"error": "word must be 5 letters"}
        return {"error": f"unknown {name}"}

    agent = AgentClient(model_id)
    turn = agent.run_turn(
        [{"role": "user", "content": "Wordle turn 1. Submit a valid opening guess."}],
        tools,
        executor,
        max_steps=ARENA_AGENT_MAX_STEPS,
        max_tokens=256,
        temperature=0.4,
        system='Call submit_guess with {"word": "SLATE"} or another 5-letter word.',
    )
    if turn.action_name != "submit_guess":
        return False, f"tool={turn.action_name!r}"
    word = str(turn.action_args.get("word", "")).upper()
    if len(word) != 5:
        return False, f"args={turn.action_args!r}"
    return True, word


def verify_battleship(model_id: str) -> tuple[bool, str]:
    client = LLMClient(model_id)
    move = client.get_move(
        "You are playing Battleship on an 8x8 grid (A-H, rows 1-8). Reply with ONLY a coordinate like A5.",
        board_letters="ABCDEFGH",
    )
    if not move:
        return False, "no move"
    return True, move


VERIFY_FNS = {
    "chat": verify_chat,
    "wordle": verify_wordle,
    "agent_tool": verify_agent_tool,
    "battleship": verify_battleship,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--modes",
        nargs="+",
        choices=MODES,
        default=list(MODES),
        help="Which invocation paths to test (default: all)",
    )
    parser.add_argument("--model", help="Test a single model id")
    args = parser.parse_args()

    models = [args.model] if args.model else CATALOG_MODEL_IDS
    failures: list[str] = []

    header = f"{'model':30} " + " ".join(f"{m:12}" for m in args.modes)
    print(header)
    print("-" * len(header))

    for model_id in models:
        cells = []
        for mode in args.modes:
            try:
                ok, detail = VERIFY_FNS[mode](model_id)
                cells.append(f"{'OK':12}" if ok else f"FAIL:{detail[:8]:12}")
                if not ok:
                    failures.append(f"{model_id}/{mode}: {detail}")
            except Exception as e:
                cells.append(f"FAIL:{str(e)[:8]:12}")
                failures.append(f"{model_id}/{mode}: {e}")
        print(f"{model_id:30} " + " ".join(cells))

    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(f"\nAll {len(models)} model(s) passed modes: {', '.join(args.modes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

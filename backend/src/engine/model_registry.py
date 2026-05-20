"""Model catalog IDs and provider API compatibility helpers."""

from __future__ import annotations

from typing import Any, List

# Keep in sync with frontend/src/config/modelCatalog.js CORE_MODELS ids
CATALOG_MODEL_IDS: List[str] = [
    "gpt-5.5",
    "gpt-5.4-mini",
    "gpt-4o",
    "o4-mini",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
]


def is_reasoning_openai(model_name: str) -> bool:
    """OpenAI o-series and GPT-5.x models use reasoning tokens before visible output."""
    m = model_name.lower()
    return any(
        m.startswith(p) or m == p.rstrip("-")
        for p in ("gpt-5", "o1", "o3", "o4")
    )


def effective_max_tokens(model_name: str, requested: int, *, for_tools: bool = False) -> int:
    """Raise completion budget floor so reasoning / tool-call models can finish."""
    if is_reasoning_openai(model_name):
        floor = 4096 if for_tools else 256
        return max(requested, floor)
    return requested


def anthropic_omit_temperature(model_name: str) -> bool:
    """Anthropic Opus 4.7 rejects the temperature parameter."""
    m = model_name.lower()
    return m == "claude-opus-4-7" or "opus-4-7" in m


def _temperature_deprecated_error(exc: BaseException) -> bool:
    err = str(exc).lower()
    return "temperature" in err and ("deprecated" in err or "not supported" in err)


def anthropic_messages_create(client: Any, **params: Any) -> Any:
    """Create an Anthropic message, omitting temperature when unsupported."""
    model = (params.get("model") or "").lower()
    if anthropic_omit_temperature(model):
        params = dict(params)
        params.pop("temperature", None)
    try:
        return client.messages.create(**params)
    except Exception as e:
        if _temperature_deprecated_error(e):
            params = dict(params)
            params.pop("temperature", None)
            return client.messages.create(**params)
        raise

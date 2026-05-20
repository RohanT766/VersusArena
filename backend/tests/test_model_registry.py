"""Unit tests for model API compatibility helpers."""

from src.engine.agent_client import _sanitize_schema_for_google
from src.engine.model_registry import (
    CATALOG_MODEL_IDS,
    anthropic_omit_temperature,
    effective_max_tokens,
    is_reasoning_openai,
)


def test_catalog_has_ten_models():
    assert len(CATALOG_MODEL_IDS) == 10


def test_opus_omits_temperature():
    assert anthropic_omit_temperature("claude-opus-4-7")
    assert not anthropic_omit_temperature("claude-sonnet-4-6")


def test_reasoning_openai_detection():
    assert is_reasoning_openai("gpt-5.5")
    assert is_reasoning_openai("o4-mini")
    assert not is_reasoning_openai("gpt-4o")


def test_effective_max_tokens_floor():
    assert effective_max_tokens("gpt-4o", 10) == 10
    assert effective_max_tokens("o4-mini", 10) == 256
    assert effective_max_tokens("o4-mini", 10, for_tools=True) == 4096


def test_google_schema_strips_min_length():
    schema = {
        "type": "object",
        "properties": {
            "word": {"type": "string", "minLength": 5, "maxLength": 5},
        },
    }
    cleaned = _sanitize_schema_for_google(schema)
    assert "minLength" not in cleaned["properties"]["word"]
    assert "maxLength" not in cleaned["properties"]["word"]

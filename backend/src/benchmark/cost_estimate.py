"""Rough USD estimates per million tokens (portfolio defaults; configurable)."""

# Edit as provider pricing shifts; purpose is comparative tracking, not billing.
_PRICE_PER_MILLION = {
    "openai:gpt": {"input": 2.5, "output": 10.0},
    "openai:o": {"input": 5.0, "output": 20.0},
    "anthropic:claude": {"input": 3.0, "output": 15.0},
    "google:gemini": {"input": 0.5, "output": 2.5},
}


def estimate_cost_usd(provider: str, model_id_lower: str, input_tokens: int, output_tokens: int) -> float:
    m = model_id_lower
    tier = None
    if provider == "OPENAI":
        tier = _PRICE_PER_MILLION["openai:o"] if m.startswith("o") else _PRICE_PER_MILLION["openai:gpt"]
    elif provider == "ANTHROPIC":
        tier = _PRICE_PER_MILLION["anthropic:claude"]
    elif provider == "GOOGLE":
        tier = _PRICE_PER_MILLION["google:gemini"]
    else:
        tier = _PRICE_PER_MILLION["openai:gpt"]

    inp = max(0, int(input_tokens or 0))
    out = max(0, int(output_tokens or 0))
    return (inp / 1_000_000.0) * tier["input"] + (out / 1_000_000.0) * tier["output"]

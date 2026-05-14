export const CORE_MODELS = [
  { id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI", tier: "flagship" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "OpenAI", tier: "balanced" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", tier: "fast" },
  { id: "o4-mini", name: "o4-mini", provider: "OpenAI", tier: "reasoning" },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", provider: "Anthropic", tier: "flagship" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic", tier: "balanced" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "Anthropic", tier: "fast" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "Google", tier: "flagship" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", tier: "balanced" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", tier: "fast" },
];

export const RANDOM_MODEL = { id: "random", name: "RANDOM", provider: "???", tier: "special", isRandom: true };

export const MODEL_OPTIONS = CORE_MODELS.map(({ id, name }) => ({ id, name }));

export const getModelName = (id) => MODEL_OPTIONS.find((m) => m.id === id)?.name || id;

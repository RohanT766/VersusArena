const MODEL_DISPLAY_NAMES = {
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-4o': 'GPT-4o',
  'o4-mini': 'o4-mini',
  'claude-opus-4-7': 'Claude Opus 4.7',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-sonnet-4': 'Claude Sonnet 4',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
};

export const getDisplayName = (modelId) => {
  if (!modelId) return 'Unknown';
  
  for (const [key, name] of Object.entries(MODEL_DISPLAY_NAMES)) {
    if (modelId.includes(key)) return name;
  }
  
  if (modelId.includes('gemini')) return 'Gemini';
  return modelId.charAt(0).toUpperCase() + modelId.slice(1);
};

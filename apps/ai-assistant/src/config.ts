const list = (v?: string) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);
export const config = {
  port: Number(process.env.AI_ASSISTANT_PORT ?? 3100),
  apiUrl: process.env.AI_BACKEND_API_URL ?? 'http://localhost:4000/api/v1',
  allowedOrigins: list(process.env.CORS_ORIGINS ?? 'http://localhost:5173'),
  llm: {
    baseURL: process.env.LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai/',
    // "lite" models are the fastest and most reliable on the free tier
    model: process.env.LLM_MODEL ?? 'gemini-3.1-flash-lite',
    /** Used when the main model is overloaded (503), rate-limited (429) or too slow. Empty = no fallback. */
    fallbackModel: process.env.LLM_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite',
    /** Less "thinking" = much faster replies. none | minimal | low | medium | high. Empty = provider default. */
    reasoningEffort: process.env.LLM_REASONING_EFFORT ?? 'low',
    apiKey: process.env.LLM_API_KEY?.includes('<change-me') ? '' : (process.env.LLM_API_KEY ?? ''),
  },
};
export const llmEnabled = () => Boolean(config.llm.apiKey);

const list = (v?: string) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);
export const config = {
  port: Number(process.env.AI_ASSISTANT_PORT ?? 3100),
  apiUrl: process.env.AI_BACKEND_API_URL ?? 'http://localhost:4000/api/v1',
  allowedOrigins: list(process.env.CORS_ORIGINS ?? 'http://localhost:5173'),
  llm: {
    baseURL: process.env.LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: process.env.LLM_MODEL ?? 'gemini-2.5-flash',
    apiKey: process.env.LLM_API_KEY?.includes('<change-me') ? '' : (process.env.LLM_API_KEY ?? ''),
  },
};
export const llmEnabled = () => Boolean(config.llm.apiKey);

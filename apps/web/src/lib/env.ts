// Single place to read build-time env, with local-dev fallbacks
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  aiAssistantUrl: import.meta.env.VITE_AI_ASSISTANT_URL ?? 'http://localhost:3100',
}

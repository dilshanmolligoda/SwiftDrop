import { createApp } from './app.js';
import { config, llmEnabled } from './config.js';

const server = createApp().listen(config.port, () => {
  console.log(
    `SwiftDrop AI assistant listening on :${config.port} ` +
      `(API ${config.apiUrl}, LLM ${llmEnabled() ? config.llm.model : 'disabled'})`,
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

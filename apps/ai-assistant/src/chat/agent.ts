import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const llm = new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.baseURL });

export async function runChat(user, history: { role: 'user' | 'assistant'; content: string }[]) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer(user);
  const mcp = new Client({ name: 'swiftdrop-chat', version: '1.0.0' });
  await Promise.all([server.connect(st), mcp.connect(ct)]);
  try {
    const { tools } = await mcp.listTools();
    const llmTools = tools.map(t => ({ type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const messages: any[] = [{ role: 'system', content: systemPrompt(user) }, ...history];

    for (let step = 0; step < 5; step++) {
      const res = await llm.chat.completions.create({ model: config.llm.model, messages, tools: llmTools, temperature: 0.2 });
      const msg = res.choices[0].message;
      messages.push(msg);
      if (!msg.tool_calls?.length) return msg.content ?? '';
      for (const call of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        const r = await mcp.callTool({ name: call.function.name, arguments: args });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(r.content).slice(0, 8000) });
      }
    }
    return 'Sorry, I could not complete that. Please try rephrasing.';
  } finally { await mcp.close(); await server.close(); }
}

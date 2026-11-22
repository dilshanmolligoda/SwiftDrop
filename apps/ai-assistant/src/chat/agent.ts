import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { config } from '../config.js';
import { buildMcpServer, type ToolContext } from '../mcp/server.js';
import { systemPrompt } from './system-prompt.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TOOL_STEPS = 5;
const MAX_TOOL_RESULT_CHARS = 8000;
/** Per LLM call. On timeout the fallback model is tried, so keep this short. */
const LLM_TIMEOUT_MS = 20_000;

let llm: OpenAI | undefined;

/** Created lazily so a missing LLM_API_KEY never crashes the service at startup. */
function getLlm(): OpenAI {
  llm ??= new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseURL,
    // The SDK default is 10 minutes; a chat user will not wait that long
    timeout: LLM_TIMEOUT_MS,
    // The fallback model is our retry; SDK retries would double the wait
    maxRetries: 0,
  });
  return llm;
}

type CompletionParams = Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'model'>;

/** True when the model is overloaded, rate-limited or too slow: worth trying another model. */
function isBusy(error: unknown): boolean {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return true;
  return error instanceof OpenAI.APIError && (error.status === 503 || error.status === 429);
}

/** Calls the main model; if it is busy (503/429/timeout) retries once with the fallback model. */
async function complete(params: CompletionParams): Promise<OpenAI.ChatCompletion> {
  const effort = config.llm.reasoningEffort;
  const request = (model: string) =>
    getLlm().chat.completions.create({
      ...params,
      model,
      ...(effort ? { reasoning_effort: effort as OpenAI.ReasoningEffort } : {}),
    });

  try {
    return await request(config.llm.model);
  } catch (error) {
    const fallback = config.llm.fallbackModel;
    if (!isBusy(error) || !fallback || fallback === config.llm.model) throw error;
    console.warn(`LLM ${config.llm.model} busy, using fallback ${fallback}`);
    return request(fallback);
  }
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Runs one chat turn: the LLM may call SwiftDrop tools (through an in-process
 * MCP client/server pair) until it can answer in plain text.
 */
export async function runChat(
  user: ToolContext & { fullName?: string },
  history: ChatMessage[],
): Promise<string> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer({ role: user.role, token: user.token });
  const mcp = new Client({ name: 'swiftdrop-chat', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);

  try {
    const { tools } = await mcp.listTools();
    const llmTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt(user) },
      ...history,
    ];

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const res = await complete({ messages, tools: llmTools, temperature: 0.2 });
      const msg = res.choices[0]?.message;
      if (!msg) break;
      messages.push(msg);

      const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === 'function');
      if (toolCalls.length === 0) {
        return msg.content?.trim() || 'Sorry, I could not find an answer to that.';
      }

      for (const call of toolCalls) {
        const result = await mcp
          .callTool({ name: call.function.name, arguments: parseArgs(call.function.arguments) })
          .catch(() => ({ content: [{ type: 'text', text: '{"error":"Tool failed"}' }] }));
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.content).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      }
    }
    return 'Sorry, I could not complete that. Please try rephrasing your question.';
  } finally {
    await mcp.close();
    await server.close();
  }
}

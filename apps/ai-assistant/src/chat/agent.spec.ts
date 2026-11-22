import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake OpenAI client: each test queues the responses the "LLM" returns.
const { create, FakeAPIError } = vi.hoisted(() => {
  class FakeAPIError extends Error {
    constructor(public status: number) {
      super(`HTTP ${status}`);
    }
  }
  return { create: vi.fn(), FakeAPIError };
});

vi.mock('openai', () => {
  class OpenAI {
    static APIError = FakeAPIError;
    chat = { completions: { create } };
  }
  return { default: OpenAI };
});

// Fake API so tool calls never hit the network
const api = vi.fn();
vi.mock('../backend/api-client.js', () => ({ createApi: () => api }));

const { runChat } = await import('./agent.js');
const { config } = await import('../config.js');

const user = { role: 'CUSTOMER' as const, token: 'tok', fullName: 'Nimal' };
const ask = [{ role: 'user' as const, content: 'How much to send 2 kg to Kandy?' }];

const text = (content: string) => ({ choices: [{ message: { role: 'assistant', content } }] });
const toolCall = (name: string, args: unknown) => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      },
    },
  ],
});

beforeEach(() => {
  create.mockReset();
  api.mockReset();
  config.llm.model = 'main-model';
  config.llm.fallbackModel = 'fallback-model';
});

describe('runChat', () => {
  it('calls a tool, feeds the result back and returns the final answer', async () => {
    api.mockResolvedValue({ totalCostLkr: 750, estimatedDays: 2 });
    create
      .mockResolvedValueOnce(toolCall('estimate_fee', { deliveryAddress: 'Kandy', weightKg: 2 }))
      .mockResolvedValueOnce(text('It costs LKR 750 and takes about 2 days.'));

    const reply = await runChat(user, ask);

    expect(reply).toBe('It costs LKR 750 and takes about 2 days.');
    expect(api).toHaveBeenCalledWith('/pricing/estimate', expect.objectContaining({ method: 'POST' }));

    // Second LLM call must contain the tool result
    const secondCall = create.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    const toolMsg = secondCall.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('750');
  });

  it('offers only the tools allowed for the role', async () => {
    create.mockResolvedValueOnce(text('Hi!'));
    await runChat(user, ask);

    const { tools } = create.mock.calls[0][0] as { tools: { function: { name: string } }[] };
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('list_my_deliveries');
    expect(names).not.toContain('merchant_dashboard');
  });

  it('puts the system prompt first and never sends the token to the LLM', async () => {
    create.mockResolvedValueOnce(text('Hi!'));
    await runChat(user, ask);

    const { messages } = create.mock.calls[0][0] as { messages: { role: string }[] };
    expect(messages[0].role).toBe('system');
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('tok');
  });

  it('switches to the fallback model when the main model is overloaded', async () => {
    create.mockRejectedValueOnce(new FakeAPIError(503)).mockResolvedValueOnce(text('Answer from fallback'));

    expect(await runChat(user, ask)).toBe('Answer from fallback');
    expect(create.mock.calls.map((c) => (c[0] as { model: string }).model)).toEqual([
      'main-model',
      'fallback-model',
    ]);
  });

  it('does not use the fallback for other errors', async () => {
    create.mockRejectedValueOnce(new FakeAPIError(400));
    await expect(runChat(user, ask)).rejects.toThrow('HTTP 400');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stops after the maximum number of tool steps', async () => {
    api.mockResolvedValue({});
    create.mockResolvedValue(toolCall('my_delivery_summary', {}));

    const reply = await runChat(user, ask);

    expect(reply).toMatch(/could not complete/i);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it('survives malformed tool arguments from the LLM', async () => {
    create
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c', type: 'function', function: { name: 'estimate_fee', arguments: '{bad' } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce(text('Please tell me the destination and weight.'));

    expect(await runChat(user, ask)).toBe('Please tell me the destination and weight.');
    expect(api).not.toHaveBeenCalled(); // validation rejected the empty args
  });
});

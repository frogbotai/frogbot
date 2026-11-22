import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildOpenAICompatibleProvider } from '../../../../../packages/gateway/src/providers/openai-compatible/index.js';

const sse = (...events: unknown[]) =>
  new Response(
    [...events.map((event) => `data: ${JSON.stringify(event)}\n\n`), 'data: [DONE]\n\n'].join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );

describe('buildOpenAICompatibleProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a provider instance exposing languageModel()', () => {
    const provider = buildOpenAICompatibleProvider('ollama', {
      baseURL: 'http://localhost:11434/v1',
    });

    expect(typeof provider.languageModel).toBe('function');

    const model = provider.languageModel('llama3.2');

    expect(model.modelId).toBe('llama3.2');
  });

  it('supports apiKey + headers passthrough', () => {
    const provider = buildOpenAICompatibleProvider('custom', {
      baseURL: 'https://example.com/v1',
      apiKey: 'secret',
      headers: { 'x-custom': '1' },
    });

    expect(provider.languageModel('some-model').modelId).toBe('some-model');
  });

  it('asks for usage on a streamed chat call, so the gateway can meter it', async () => {
    const bodies: Record<string, unknown>[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        const usage = (body.stream_options as { include_usage?: boolean } | undefined)
          ?.include_usage
          ? { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 }
          : undefined;

        return Promise.resolve(
          sse(
            { id: 'c1', choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' } }] },
            { id: 'c1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
          ),
        );
      }),
    );

    const provider = buildOpenAICompatibleProvider('compat', {
      baseURL: 'https://compat.example/v1',
      apiKey: 'k',
    });

    const { stream } = await provider.chatModel('m').doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    const parts = [];

    for (const reader = stream.getReader(); ;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }

    const finish = parts.find((part) => part.type === 'finish');

    expect(bodies[0]?.stream_options).toEqual({ include_usage: true });
    expect(finish).toMatchObject({
      usage: { inputTokens: { total: 7 }, outputTokens: { total: 3 } },
    });
  });
});

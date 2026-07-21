// gateway.operation() — first-class in-process operation lifecycle.
//
// Covers the 5-phase hook lifecycle for in-process callers (FrogBot):
// `start()` gates via beforeOperation, model getters share the operation's
// requestId/context with upstream hooks, and `finish()` fires afterOperation
// with accumulated finishReason/usage/error.

import { MockLanguageModelV4 } from 'ai/test';
import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { createGateway, type Gateway } from './gateway.js';
import { type Hooks } from './hooks.js';

const okGenerate = () =>
  vi.fn(() =>
    Promise.resolve({
    content: [{ type: 'text' as const, text: 'hello' }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  }));

function makeGateway(hooks: Hooks, doGenerate = okGenerate()): Gateway {
  const gw = createGateway({ providers: { openai: { apiKey: 'test-key' } }, hooks });
  gw.registry.openai = {
    languageModel: () => new MockLanguageModelV4({ doGenerate }),
  } as unknown as typeof gw.registry.openai;
  return gw;
}

describe('gateway.operation', () => {
  it('start fires beforeOperation with the seeded context and no request', async () => {
    const beforeOperation = vi.fn();
    const gw = makeGateway({ beforeOperation: [beforeOperation] });
    const op = gw.operation({ operation: 'chat.completions', model: 'openai/chat', context: { tenant: 'a' } });

    await op.start();

    expect(beforeOperation).toHaveBeenCalledOnce();
    const args = beforeOperation.mock.calls[0][0];
    expect(args).toMatchObject({ phase: 'beforeOperation', operation: 'chat.completions', requestId: op.requestId });
    expect(args.context).toBe(op.context);
    expect(args.context.tenant).toBe('a');
    expect(args.request).toBeUndefined();
  });

  it('start propagates a throwing beforeOperation (gate, not isolated)', async () => {
    const gw = makeGateway({
      beforeOperation: [
        () => {
          throw new Error('denied');
        },
      ],
    });
    const op = gw.operation({ operation: 'chat.completions', model: 'openai/chat' });

    await expect(op.start()).rejects.toThrow('denied');
  });

  it('upstream hooks share the operation requestId and context reference', async () => {
    const seen: { phase: string; requestId: string; context: Record<string, unknown> }[] = [];
    const gw = makeGateway({
      beforeUpstream: [
        (args) => {
          seen.push({ phase: args.phase, requestId: args.requestId, context: args.context });
          args.context.fromHook = true;
        },
      ],
      afterUpstream: [
        (args) => {
          seen.push({ phase: args.phase, requestId: args.requestId, context: args.context });
        },
      ],
    });
    const op = gw.operation({ operation: 'chat.completions', model: 'openai/chat', context: { seed: 1 } });

    await op.start();
    await generateText({ model: op.chatModel(), prompt: 'hi' });

    expect(seen.map((s) => s.phase)).toEqual(['beforeUpstream', 'afterUpstream']);
    for (const entry of seen) {
      expect(entry.requestId).toBe(op.requestId);
      expect(entry.context).toBe(op.context);
    }
    expect(op.context.fromHook).toBe(true);
    expect(op.context.seed).toBe(1);
  });

  it('accumulates usage across upstream rounds and passes the sum to afterOperation', async () => {
    const afterOperation = vi.fn();
    const gw = makeGateway({ afterOperation: [afterOperation] });
    const op = gw.operation({ operation: 'chat.completions', model: 'openai/chat' });

    await op.start();
    const model = op.chatModel();
    await generateText({ model, prompt: 'one' });
    await generateText({ model, prompt: 'two' });
    await op.finish();

    expect(afterOperation).toHaveBeenCalledOnce();
    const args = afterOperation.mock.calls[0][0];
    expect(args).toMatchObject({
      phase: 'afterOperation',
      operation: 'chat.completions',
      requestId: op.requestId,
      model: 'openai/chat',
      provider: 'openai',
      finishReason: 'stop',
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });
    expect(typeof args.durationMs).toBe('number');
    expect(args.error).toBeUndefined();
  });

  it('finish is idempotent, explicit values override, and hook errors are isolated', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const afterOperation = vi.fn(() => {
      throw new Error('hook boom');
    });
    const gw = makeGateway({ afterOperation: [afterOperation] });
    const op = gw.operation({ operation: 'chat.completions', model: 'openai/chat' });
    const explicitError = new Error('explicit failure');

    await op.start();
    await generateText({ model: op.chatModel(), prompt: 'hi' });
    await expect(
      op.finish({ finishReason: 'abort', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, error: explicitError }),
    ).resolves.toBeUndefined();
    await op.finish();

    expect(afterOperation).toHaveBeenCalledOnce();
    const args = afterOperation.mock.calls[0][0];
    expect(args.finishReason).toBe('abort');
    expect(args.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    expect(args.error).toBe(explicitError);
    consoleError.mockRestore();
  });

  it('records a doGenerate error via afterError and passes it to afterOperation', async () => {
    const upstreamError = new Error('upstream failed');
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const gw = makeGateway(
      { afterError: [afterError], afterOperation: [afterOperation] },
      vi.fn(() => {
        throw upstreamError;
      }),
    );
    const op = gw.operation({ operation: 'chat.completions', model: 'openai/chat' });

    await op.start();
    await expect(generateText({ model: op.chatModel(), prompt: 'hi', maxRetries: 0 })).rejects.toThrow(
      'upstream failed',
    );
    await op.finish();

    expect(afterError).toHaveBeenCalledOnce();
    expect(afterError.mock.calls[0][0].error).toBe(upstreamError);
    expect(afterOperation).toHaveBeenCalledOnce();
    expect(afterOperation.mock.calls[0][0].error).toBe(upstreamError);
  });
});

describe('gateway.handler context seed', () => {
  const chatBody = () =>
    JSON.stringify({ model: 'openai/chat', messages: [{ role: 'user', content: 'hi' }] });

  it('seeds hook context from the handler context option', async () => {
    const beforeOperation = vi.fn();
    const gw = makeGateway({ beforeOperation: [beforeOperation] });
    const seed = { foo: 1 };

    const res = await gw.handler(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: chatBody(),
      }),
      { context: seed },
    );

    expect(res.status).toBe(200);
    expect(beforeOperation).toHaveBeenCalledOnce();
    const args = beforeOperation.mock.calls[0][0];
    expect(args.context).toBe(seed);
    expect(args.context.foo).toBe(1);
  });

  it('defaults hook context to a fresh unseeded bag without an env seed', async () => {
    // Built-in observability hooks stamp their own keys into the bag before
    // user hooks run, so assert freshness + absence of seeds rather than {}.
    const contexts: Record<string, unknown>[] = [];
    const gw = makeGateway({
      beforeOperation: [
        (args) => {
          contexts.push(args.context);
        },
      ],
    });
    const makeRequest = () =>
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: chatBody(),
      });

    const first = await gw.handler(makeRequest());
    const second = await gw.handler(makeRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(contexts).toHaveLength(2);
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(contexts[0].foo).toBeUndefined();
    expect(contexts[1].foo).toBeUndefined();
  });
});

describe('gateway.chatModel default path', () => {
  it('still mints a fresh requestId per upstream call', async () => {
    const requestIds: string[] = [];
    const gw = makeGateway({
      beforeUpstream: [
        (args) => {
          requestIds.push(args.requestId);
        },
      ],
    });
    const model = gw.chatModel('openai/chat');

    await generateText({ model, prompt: 'one' });
    await generateText({ model, prompt: 'two' });

    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });
});

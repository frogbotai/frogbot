import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CallCredentialError } from '../../packages/gateway/src/errors/gatewayError.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';

const MODEL = 'openai/gpt-4o-mini';

let authorizations: (string | null)[];

function responsesReply() {
  return Response.json({
    id: 'response-1',
    object: 'response',
    created_at: 1,
    model: 'gpt-4o-mini',
    output: [
      {
        id: 'message-1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'ok', annotations: [] }],
      },
    ],
    status: 'completed',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
}

beforeEach(() => {
  authorizations = [];
  vi.stubEnv('OPENAI_API_KEY', undefined);

  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      authorizations.push(new Headers(init?.headers).get('authorization'));

      return Promise.resolve(responsesReply());
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('per-call credential over HTTP', () => {
  it("sends the key credential picks from the handler's context, with via 'http'", async () => {
    const calls: { user: unknown; via: string }[] = [];
    const gw = createGateway({
      providers: {
        openai: {
          apiKey: 'sk-app',
          credential: (context, { via }) => {
            calls.push({ user: context.user, via });

            return context.user
              ? { settings: { apiKey: `sk-${String(context.user)}` } }
              : undefined;
          },
        },
      },
    });

    const chat = (context: Record<string, unknown>) =>
      gw.handler(
        new Request('http://gateway.test/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { context },
      );

    const [linked, unlinked] = await Promise.all([chat({ user: 'alice' }), chat({})]);

    expect(linked.status).toBe(200);
    expect(unlinked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      choices: [{ message: { content: 'ok' } }],
    });
    expect(authorizations.sort()).toEqual(['Bearer sk-alice', 'Bearer sk-app']);
    expect(calls).toEqual([
      { user: 'alice', via: 'http' },
      { user: undefined, via: 'http' },
    ]);
  });

  it('answers a CallCredentialError with 401 and its message, sending nothing upstream', async () => {
    const gw = createGateway({
      providers: {
        openai: {
          credential: () => {
            throw new CallCredentialError('OpenAI is not set up.');
          },
        },
      },
    });

    const response = await gw.handler(
      new Request('http://gateway.test/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'hi' }] }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { message: 'OpenAI is not set up.', type: 'authentication_error' },
    });
    expect(authorizations).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { AfterOperationHookArgs } from '../../packages/gateway/src/hooks.js';
import { calculateModelCostUSD } from '../../packages/gateway/src/providers/cost.js';
import type { VertexConfig } from '../../packages/gateway/src/providers/vertex/index.js';

const GEMINI = 'vertex/gemini-3.5-flash';
const CLAUDE = 'vertex/claude-sonnet-4-6@default';

const GEMINI_RESPONSE = {
  candidates: [
    { content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP', index: 0 },
  ],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, totalTokenCount: 15 },
};

const CLAUDE_RESPONSE = {
  id: 'msg_vertex',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'ok' }],
  model: 'claude-sonnet-4-6',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 200,
    output_tokens: 40,
    cache_read_input_tokens: 800,
    cache_creation_input_tokens: 100,
  },
};

const authClient = {
  getAccessToken: () => Promise.resolve({ token: 'adc-token' }),
} as unknown as NonNullable<VertexConfig['googleAuthOptions']>['authClient'];

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

let captured: Captured[];

beforeEach(() => {
  captured = [];
  vi.stubEnv('GOOGLE_VERTEX_API_KEY', '');
  vi.stubEnv('GOOGLE_VERTEX_PROJECT', '');
  vi.stubEnv('GOOGLE_VERTEX_LOCATION', '');

  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    captured.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });

    return Promise.resolve(
      Response.json(url.includes('/publishers/anthropic/') ? CLAUDE_RESPONSE : GEMINI_RESPONSE),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function post(vertex: VertexConfig, body: Record<string, unknown>) {
  const operations: AfterOperationHookArgs[] = [];
  const gateway = createGateway({
    providers: { vertex: { googleAuthOptions: { authClient }, ...vertex } },
    hooks: { afterOperation: [(args) => void operations.push(args)] },
  });

  const response = await gateway.handler(
    new Request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, text: await response.text(), operations };
}

describe('Vertex AI provider — wire integration', () => {
  it('sends Gemini thinking with another passthrough option to the Gemini publisher', async () => {
    const { status, text } = await post(
      { project: 'acme', location: 'global' },
      {
        model: GEMINI,
        max_tokens: 10_000,
        reasoning_effort: 'high',
        prompt_cache_key: 'cachedContents/abc',
        messages: [{ role: 'user', content: 'hi' }],
      },
    );

    expect(status, text).toBe(200);
    expect(captured).toHaveLength(1);

    const [call] = captured;

    expect(call?.url).toBe(
      'https://aiplatform.googleapis.com/v1beta1/projects/acme/locations/global/publishers/google/models/gemini-3.5-flash:generateContent',
    );
    expect(call?.headers.get('authorization')).toBe('Bearer adc-token');
    expect(call?.body.generationConfig).toMatchObject({
      thinkingConfig: { thinkingBudget: 8000 },
    });
    expect(call?.body.cachedContent).toBe('cachedContents/abc');
  });

  it('sends Claude thinking and cache_control to the Anthropic publisher in anthropic.location', async () => {
    const { status, text, operations } = await post(
      { project: 'acme', location: 'global', anthropic: { location: 'us-east5' } },
      {
        model: CLAUDE,
        max_tokens: 10_000,
        reasoning_effort: 'high',
        prompt_cache_key: 'session-1',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'context', cache_control: { type: 'ephemeral' } },
              { type: 'text', text: 'hi' },
            ],
          },
        ],
      },
    );

    expect(status, text).toBe(200);
    expect(captured).toHaveLength(1);

    const [call] = captured;

    expect(call?.url).toBe(
      'https://us-east5-aiplatform.googleapis.com/v1/projects/acme/locations/us-east5/publishers/anthropic/models/claude-sonnet-4-6@default:rawPredict',
    );
    expect(call?.headers.get('authorization')).toBe('Bearer adc-token');
    expect(call?.body.anthropic_version).toBe('vertex-2023-10-16');
    expect(call?.body.thinking).toEqual({ type: 'enabled', budget_tokens: 8000 });
    expect(call?.body).not.toHaveProperty('cached_content');
    expect(call?.body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'context', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'hi' },
        ],
      },
    ]);

    const usage = operations[0]?.usage;

    expect(usage).toMatchObject({ cachedInputTokens: 800, cacheWriteTokens: 100 });
    expect(calculateModelCostUSD(CLAUDE, usage!)).toBeGreaterThan(0);
  });

  it('fails a Claude request with no project with a clear error and no upstream call', async () => {
    const { status, text } = await post(
      { location: 'us-east5' },
      { model: CLAUDE, messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(status).toBe(500);
    expect(text).toContain('project and a location for Claude');
    expect(text).not.toContain('undefined');
    expect(captured).toHaveLength(0);
  });
});

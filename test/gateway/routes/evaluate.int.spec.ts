import { createTypeSafeAi } from '@ai-sdk/typesafe-ai';
import { describe, expect, it, vi } from 'vitest';

import { createApp, getRoutes } from '../../../packages/gateway/src/app.js';
import { DEFAULT_MODEL_CATALOG } from '../../../packages/gateway/src/providers/catalog.data.js';
import type { ProviderRegistry } from '../../../packages/gateway/src/providers/registry.js';

const questions = {
  team: {
    type: 'choice',
    instructions: { prompt: 'Which team should handle the ticket?' },
    criteria: { billing: { area: 'refunds' }, technical: ['outages'] },
  },
  urgency: {
    type: 'score',
    instructions: ['How urgent is the ticket?'],
    criteria: ['low', 'medium', 'high'],
  },
  refunded: {
    type: 'boolean',
    instructions: 'Was a refund requested?',
    criteria: { true: { event: 'refund' }, false: null },
  },
};

const response = {
  model: 'jev-1.13.0',
  answers: {
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 0.8, technical: 0.2 },
      confidence: 0.7,
    },
    urgency: {
      type: 'score',
      score: 1.5,
      probabilities: { 0: 0, 1: 0.5, 2: 0.5 },
      confidence: 0.6,
    },
    refunded: { type: 'noul', noul: 0.91 },
  },
  usage: { input_tokens: 471, output_tokens: 71 },
};

function fixture(
  options: {
    response?: unknown;
    basePath?: string;
    allowlists?: ReadonlyMap<string, ReadonlySet<string>>;
  } = {},
) {
  const fetch = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(options.response ?? response), {
        headers: { 'content-type': 'application/json', 'x-private': 'upstream-secret' },
      }),
  );
  const registry = {
    'typesafe-ai': createTypeSafeAi({ apiKey: 'test-provider-key', fetch }),
  } as unknown as ProviderRegistry;
  const app = createApp({
    registry,
    catalog: DEFAULT_MODEL_CATALOG,
    allowlists: options.allowlists,
    basePath: options.basePath,
  });

  return { app, fetch };
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer caller-secret',
      'x-correlation-id': 'correlation-123',
    },
    body: JSON.stringify(body),
  });
}

describe('standalone evaluation route', () => {
  it.each(['/evaluate', '/v1/evaluate'])(
    'converts TypeSafe wire evaluation at %s',
    async (path) => {
      const { app, fetch } = fixture();
      const state = { ticket: ['charged twice', { refund: true }] };

      const res = await app.fetch(post(path, { model: 'typesafe-ai/jev', state, questions }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        model: 'typesafe-ai/jev-1.13.0',
        answers: {
          team: {
            type: 'choice',
            choice: 'billing',
            probabilities: { billing: 0.8, technical: 0.2 },
          },
          urgency: { type: 'score', score: 1.5, probabilities: { 0: 0, 1: 0.5, 2: 0.5 } },
          refunded: { type: 'boolean', probability: 0.91 },
        },
        usage: { inputTokens: 471, outputTokens: 71 },
        providerMetadata: { typesafe: { confidence: { team: 0.7, urgency: 0.6 } } },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0][0])).toBe('https://api.typesafe.ai/v1/systemone');

      const init = fetch.mock.calls[0][1];
      const upstream = JSON.parse(String(init?.body));

      expect(upstream).toMatchObject({
        model: 'jev-latest',
        state,
        questions: { refunded: { type: 'noul' } },
      });
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-provider-key');
      expect(JSON.stringify(init)).not.toContain('caller-secret');
      expect(new Headers(init?.headers).get('x-correlation-id')).toBe('correlation-123');
    },
  );

  it('mounts the configured prefix and exposes the selective route handler', async () => {
    const { app, fetch } = fixture({
      basePath: '/gateway',
      response: { ...response, answers: { refunded: response.answers.refunded } },
    });
    const body = {
      model: 'typesafe-ai/jev-latest',
      state: 'refund requested',
      questions: { refunded: questions.refunded },
    };

    const prefixed = await app.fetch(post('/gateway/evaluate', body));
    const selective = await getRoutes(app)?.['/evaluate'].handler(post('/evaluate', body));
    const unavailable = await app.fetch(post('/v1/evaluate', body));
    const health = await app.request('/health');

    expect(prefixed.status).toBe(200);
    expect(selective?.status).toBe(200);
    expect(unavailable.status).toBe(404);
    expect((await health.json()).modalities).toContain('evaluate');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects disallowed and unknown models before TypeSafe receives a call', async () => {
    const { app, fetch } = fixture({
      allowlists: new Map([['typesafe-ai', new Set(['typesafe-ai/jev-latest'])]]),
      response: { ...response, answers: { refunded: response.answers.refunded } },
    });
    const body = { state: 'refund', questions: { refunded: questions.refunded } };

    const allowed = await app.fetch(post('/evaluate', { ...body, model: 'typesafe-ai/jev' }));
    const denied = await app.fetch(post('/evaluate', { ...body, model: 'typesafe-ai/unknown' }));

    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(404);
    expect((await denied.json()).error.code).toBe('model_not_found');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects TypeSafe score limits before contacting the upstream', async () => {
    const { app, fetch } = fixture();
    const tooManyScores = await app.fetch(
      post('/evaluate', {
        model: 'typesafe-ai/jev',
        state: 'refund',
        questions: {
          urgency: { type: 'score', instructions: 'Priority?', criteria: Array(11).fill('level') },
        },
      }),
    );

    expect(tooManyScores.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed provider answers after the TypeSafe wire translation', async () => {
    const invalid = fixture({
      response: {
        model: 'jev-1.13.0',
        answers: { refunded: { type: 'noul', noul: 3 } },
      },
    });
    const malformedAnswer = await invalid.app.fetch(
      post('/evaluate', {
        model: 'typesafe-ai/jev',
        state: 'refund',
        questions: { refunded: questions.refunded },
      }),
    );

    expect(malformedAnswer.status).toBe(502);
    expect((await malformedAnswer.json()).error).toMatchObject({ type: 'server_error' });
    expect(invalid.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an uncatalogued model before contacting the upstream', async () => {
    const { app, fetch } = fixture();

    const res = await app.fetch(
      post('/evaluate', {
        model: 'typesafe-ai/not-a-model',
        state: 'refund',
        questions: { refunded: questions.refunded },
      }),
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('model_not_found');
    expect(fetch).not.toHaveBeenCalled();
  });
});

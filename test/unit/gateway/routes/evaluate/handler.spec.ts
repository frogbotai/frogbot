import type {
  Experimental_EvaluationModelV4,
  Experimental_EvaluationModelV4CallOptions,
} from '@ai-sdk/provider';
import { Experimental_EvaluationMockModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { type AppContext, createApp } from '../../../../../packages/gateway/src/app.js';
import type { Hooks } from '../../../../../packages/gateway/src/hooks.js';
import type { ProviderRegistry } from '../../../../../packages/gateway/src/providers/registry.js';

const questions = {
  approved: { type: 'boolean', instructions: 'Was the request approved?' },
};

function makeApp(model: Experimental_EvaluationModelV4, options: Partial<AppContext> = {}) {
  const registry = {
    'typesafe-ai': { evaluationModel: () => model },
  } as unknown as ProviderRegistry;

  return createApp({ registry, ...options });
}

function post(app: ReturnType<typeof createApp>, body: unknown, path = '/v1/evaluate') {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer caller-secret',
      'x-correlation-id': 'correlation-123',
    },
    body: JSON.stringify(body),
  });
}

describe('evaluateRoute', () => {
  it('evaluates mixed questions against structured state and forwards mutable hook options', async () => {
    const doEvaluate = vi.fn(async (_options: Experimental_EvaluationModelV4CallOptions) => ({
      answers: {
        approved: { type: 'boolean' as const, probability: 0.91 },
        team: {
          type: 'choice' as const,
          choice: 'billing',
          probabilities: { billing: 0.8, support: 0.2 },
        },
        priority: {
          type: 'score' as const,
          score: 1.5,
          probabilities: { 0: 0, 1: 0.5, 2: 0.5 },
        },
      },
      usage: { inputTokens: 12, outputTokens: 3 },
      response: {
        modelId: 'jev-1.13.0',
        body: { secret: 'raw-provider-body' },
        headers: { 'x-private': 'secret' },
      },
      providerMetadata: { typesafe: { confidence: { team: 0.72 } } },
      warnings: [],
      rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
    }));
    const model = new Experimental_EvaluationMockModelV4({ doEvaluate });

    const phases: string[] = [];

    const hooks: Hooks = {
      beforeOperation: [
        ({ phase }) => {
          phases.push(phase);
        },
      ],
      beforeUpstream: [
        ({ phase, headers, providerOptions }) => {
          phases.push(phase);

          headers.set('x-correlation-id', 'hook-correlation');
          providerOptions.typesafe = { ...providerOptions.typesafe, locale: 'en' };
        },
      ],
      afterUpstream: [
        ({ phase, usage }) => {
          phases.push(phase);
          expect(usage).toEqual({ inputTokens: 12, outputTokens: 3, totalTokens: 15 });
        },
      ],
      afterOperation: [
        ({ phase, usage, error }) => {
          phases.push(phase);
          expect(usage).toEqual({ inputTokens: 12, outputTokens: 3, totalTokens: 15 });
          expect(error).toBeUndefined();
        },
      ],
    };

    const app = makeApp(model, { hooks });
    const state = { ticket: ['refund requested', { amount: 49 }] };

    const allQuestions = {
      ...questions,
      team: {
        type: 'choice',
        instructions: { question: 'Which team?' },
        criteria: { billing: { reason: 'charge' }, support: null },
      },
      priority: {
        type: 'score',
        instructions: ['How urgent?'],
        criteria: ['low', { level: 'medium' }, 'high'],
      },
    };

    const res = await post(app, {
      model: 'typesafe-ai/jev-latest',
      state,
      questions: allQuestions,
      providerOptions: { typesafe: { initial: true } },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model: 'typesafe-ai/jev-1.13.0',
      answers: {
        approved: { type: 'boolean', probability: 0.91 },
        team: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.8, support: 0.2 },
        },
        priority: {
          type: 'score',
          score: 1.5,
          probabilities: { 0: 0, 1: 0.5, 2: 0.5 },
        },
      },
      usage: { inputTokens: 12, outputTokens: 3 },
      providerMetadata: { typesafe: { confidence: { team: 0.72 } } },
    });

    expect(phases).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        state,
        questions: allQuestions,
        providerOptions: { typesafe: { initial: true, locale: 'en' } },
        headers: expect.objectContaining({ 'x-correlation-id': 'hook-correlation' }),
      }),
    );
    expect(JSON.stringify(doEvaluate.mock.calls[0][0])).not.toContain('caller-secret');
  });

  it('keeps missing usage optional in hooks and omits unreported metadata', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      doEvaluate: async () => ({
        answers: { approved: { type: 'boolean', probability: 0.5 } },
        warnings: [],
      }),
    });
    const afterUpstream = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      hooks: { afterUpstream: [afterUpstream], afterOperation: [afterOperation] },
    });

    const res = await post(app, { model: 'typesafe-ai/jev', state: 'a request', questions });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model: 'typesafe-ai/jev',
      answers: { approved: { type: 'boolean', probability: 0.5 } },
      usage: {},
    });
    expect(afterUpstream.mock.calls[0][0].usage).toBeUndefined();
    expect(afterOperation.mock.calls[0][0].usage).toBeUndefined();
    expect(afterOperation).toHaveBeenCalledTimes(1);
  });

  it('normalizes partially reported usage for hooks without inventing response tokens', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      doEvaluate: async () => ({
        answers: { approved: { type: 'boolean', probability: 0.5 } },
        usage: { inputTokens: 9 },
        warnings: [],
      }),
    });
    const afterUpstream = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      hooks: { afterUpstream: [afterUpstream], afterOperation: [afterOperation] },
    });

    const res = await post(app, { model: 'typesafe-ai/jev', state: 'x', questions });

    expect(res.status).toBe(200);
    expect((await res.json()).usage).toEqual({ inputTokens: 9 });
    expect(afterUpstream.mock.calls[0][0].usage).toEqual({
      inputTokens: 9,
      outputTokens: 0,
      totalTokens: 9,
    });
    expect(afterOperation.mock.calls[0][0].usage).toEqual({
      inputTokens: 9,
      outputTokens: 0,
      totalTokens: 9,
    });
  });

  it('gates before parsing and does not finalize pre-resolution failures', async () => {
    const beforeUpstream = vi.fn();
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(new Experimental_EvaluationMockModelV4(), {
      hooks: {
        beforeOperation: [
          () => {
            throw new Error('denied before parsing');
          },
        ],
        beforeUpstream: [beforeUpstream],
        afterError: [afterError],
        afterOperation: [afterOperation],
      },
    });

    const res = await app.request('/v1/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({ type: 'server_error' });
    expect(beforeUpstream).not.toHaveBeenCalled();
    expect(afterError).not.toHaveBeenCalled();
    expect(afterOperation).not.toHaveBeenCalled();
  });

  it('returns schema and body-cap errors before resolution', async () => {
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(new Experimental_EvaluationMockModelV4(), {
      maxBodyBytes: 150,
      hooks: { afterError: [afterError], afterOperation: [afterOperation] },
    });

    const missingQuestions = await post(app, {
      model: 'typesafe-ai/jev',
      state: 'x',
      questions: {},
    });
    const oversized = await post(app, {
      model: 'typesafe-ai/jev',
      state: 'x'.repeat(200),
      questions,
    });
    const missingState = await post(app, { model: 'typesafe-ai/jev', questions });
    const malformedJson = await app.request('/v1/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    expect(missingQuestions.status).toBe(400);
    expect((await missingQuestions.json()).error.param).toBe('questions');
    expect(oversized.status).toBe(413);
    expect(missingState.status).toBe(400);
    expect((await missingState.json()).error.param).toBe('state');
    expect(malformedJson.status).toBe(400);
    expect(afterError).not.toHaveBeenCalled();
    expect(afterOperation).not.toHaveBeenCalled();
  });

  it('classifies an unsupported question type as 422 after resolution', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      supportedQuestionTypes: ['boolean'],
      doEvaluate: vi.fn(),
    });
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      hooks: { afterError: [afterError], afterOperation: [afterOperation] },
    });

    const res = await post(app, {
      model: 'typesafe-ai/jev',
      state: 'x',
      questions: { team: { type: 'choice', instructions: 'Which?', criteria: { a: 'A' } } },
    });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({
      type: 'invalid_request_error',
      code: 'unprocessable_entity',
    });
    expect(afterError.mock.calls[0][0].failedPhase).toBe('upstream');
    expect(afterOperation.mock.calls[0][0].error).toBeDefined();
    expect(afterError).toHaveBeenCalledTimes(1);
    expect(afterOperation).toHaveBeenCalledTimes(1);
  });

  it('rejects providers without evaluation capability before operation hooks begin', async () => {
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = createApp({
      registry: { cohere: {} } as unknown as ProviderRegistry,
      hooks: { afterError: [afterError], afterOperation: [afterOperation] },
    });

    const res = await post(app, { model: 'cohere/rerank-v3.5', state: 'x', questions });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('unsupported_modality');
    expect(afterError).not.toHaveBeenCalled();
    expect(afterOperation).not.toHaveBeenCalled();
  });

  it('rejects invalid answers after calling the model and finalizes once', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      doEvaluate: async () => ({
        answers: { approved: { type: 'boolean', probability: 2 } },
        warnings: [],
      }),
    });
    const afterUpstream = vi.fn();
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      hooks: {
        afterUpstream: [afterUpstream],
        afterError: [afterError],
        afterOperation: [afterOperation],
      },
    });

    const res = await post(app, { model: 'typesafe-ai/jev', state: 'x', questions });

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('bad_gateway');
    expect(afterUpstream).not.toHaveBeenCalled();
    expect(afterError.mock.calls[0][0].failedPhase).toBe('upstream');
    expect(afterOperation).toHaveBeenCalledTimes(1);
  });

  it('reports beforeUpstream hook failures without calling the model', async () => {
    const doEvaluate = vi.fn();
    const model = new Experimental_EvaluationMockModelV4({ doEvaluate });
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      hooks: {
        beforeUpstream: [
          () => {
            throw new Error('upstream blocked');
          },
        ],
        afterError: [afterError],
        afterOperation: [afterOperation],
      },
    });

    const res = await post(app, { model: 'typesafe-ai/jev', state: 'x', questions });

    expect(res.status).toBe(500);
    expect(doEvaluate).not.toHaveBeenCalled();
    expect(afterError.mock.calls[0][0].failedPhase).toBe('beforeUpstream');
    expect(afterOperation).toHaveBeenCalledTimes(1);
  });

  it('cancels an aborted caller request and finalizes the resolved operation', async () => {
    const doEvaluate = vi.fn();
    const model = new Experimental_EvaluationMockModelV4({ doEvaluate });
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      hooks: {
        afterError: [afterError],
        afterOperation: [afterOperation],
      },
    });
    const controller = new AbortController();
    const request = new Request('http://localhost/v1/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'typesafe-ai/jev', state: 'x', questions }),
      signal: controller.signal,
    });

    controller.abort();

    const res = await app.fetch(request);

    expect(res.status).toBe(499);
    expect(doEvaluate).not.toHaveBeenCalled();
    expect(afterError).toHaveBeenCalledTimes(1);
    expect(afterOperation).toHaveBeenCalledTimes(1);
  });

  it('reports a server-side upstream deadline as 504 and finalizes once', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      doEvaluate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        }),
    });
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const app = makeApp(model, {
      upstreamTimeoutMs: 15,
      hooks: { afterError: [afterError], afterOperation: [afterOperation] },
    });

    const res = await post(app, { model: 'typesafe-ai/jev', state: 'x', questions });

    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe('gateway_timeout');
    expect(afterError).toHaveBeenCalledTimes(1);
    expect(afterOperation).toHaveBeenCalledTimes(1);
  });
});

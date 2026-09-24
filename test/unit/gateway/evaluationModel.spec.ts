import type { Experimental_EvaluationModelV4CallOptions } from '@ai-sdk/provider';
import { experimental_evaluate } from 'ai';
import { Experimental_EvaluationMockModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import {
  ModelNotFoundError,
  ModelUnsupportedOperationError,
  UnsupportedModalityError,
} from '../../../packages/gateway/src/errors/gatewayError.js';
import { createGateway } from '../../../packages/gateway/src/gateway.js';
import { DEFAULT_MODEL_CATALOG } from '../../../packages/gateway/src/providers/catalog.data.js';

const questions = {
  refunded: { type: 'boolean' as const, instructions: 'Was a refund issued?' },
};

describe('gateway evaluation model', () => {
  it('canonicalizes jev before the catalog and allowlist and keeps the requested hook model', async () => {
    const upstream = vi.fn(async (_options: Experimental_EvaluationModelV4CallOptions) => ({
      answers: { refunded: { type: 'boolean' as const, probability: 0.8 } },
      usage: { inputTokens: 14, outputTokens: 2 },
      warnings: [],
    }));
    const beforeUpstream = vi.fn();
    const gateway = createGateway({
      providers: { 'typesafe-ai': { apiKey: 'secret', models: ['jev'] } },
      hooks: { beforeUpstream: [beforeUpstream] },
    });
    const provider = gateway.registry['typesafe-ai']!;

    gateway.registry['typesafe-ai'] = {
      ...provider,
      evaluationModel: (id) =>
        new Experimental_EvaluationMockModelV4({
          modelId: id,
          provider: 'typesafe.evaluation',
          doEvaluate: upstream,
        }),
    };

    const result = await experimental_evaluate({
      model: gateway.evaluationModel('typesafe-ai/jev'),
      state: 'A refund was issued',
      questions,
    });

    expect(result.answers.refunded.probability).toBe(0.8);
    expect(upstream).toHaveBeenCalledOnce();
    expect(beforeUpstream).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'evaluate',
        model: 'typesafe-ai/jev',
        provider: 'typesafe-ai',
      }),
    );
    expect(gateway.evaluationModel('typesafe-ai/jev').modelId).toBe('jev-latest');
    expect(gateway.evaluationModel('typesafe-ai/jev-latest').modelId).toBe('jev-latest');
    expect(() => gateway.evaluationModel('typesafe-ai/jev-preview')).toThrow(ModelNotFoundError);
  });

  it('rejects unsupported catalog operations before calling the SDK model', () => {
    const gateway = createGateway({ providers: { 'typesafe-ai': { apiKey: 'secret' } } });

    expect(() => gateway.chatModel('typesafe-ai/jev')).toThrow(ModelUnsupportedOperationError);
    expect(() => gateway.evaluationModel('typesafe-ai/missing')).toThrow(ModelNotFoundError);
  });

  it('rejects evaluation when the configured provider lacks that capability', () => {
    const entry = DEFAULT_MODEL_CATALOG.get('typesafe-ai/jev-latest')!;
    const catalog = new Map([
      ['openai/evaluation-only', { ...entry, id: 'openai/evaluation-only', providers: ['openai'] }],
    ]);

    const gateway = createGateway({
      providers: { openai: { apiKey: 'secret', models: ['evaluation-only'] } },
      catalog,
    });

    expect(() => gateway.evaluationModel('openai/evaluation-only')).toThrow(
      UnsupportedModalityError,
    );
  });

  it('shares operation context and normalizes optional evaluation tokens once', async () => {
    const phases: string[] = [];
    const afterUpstream = vi.fn();
    const afterOperation = vi.fn();
    const upstream = vi.fn(async (_options: Experimental_EvaluationModelV4CallOptions) => ({
      answers: { refunded: { type: 'boolean' as const, probability: 0.8 } },
      usage: { inputTokens: 14 },
      warnings: [],
    }));
    const gateway = createGateway({
      providers: { 'typesafe-ai': { apiKey: 'secret' } },
      hooks: {
        beforeOperation: [
          (args) => {
            phases.push(args.phase);
            args.context.seeded = true;
          },
        ],
        beforeUpstream: [
          (args) => {
            phases.push(args.phase);
            expect(args.context.seeded).toBe(true);
            args.headers.set('x-eval', 'test');
          },
        ],
        afterUpstream: [
          (args) => {
            phases.push(args.phase);
            afterUpstream(args);
          },
        ],
        afterOperation: [
          (args) => {
            phases.push(args.phase);
            afterOperation(args);
          },
        ],
      },
    });
    const provider = gateway.registry['typesafe-ai']!;

    gateway.registry['typesafe-ai'] = {
      ...provider,
      evaluationModel: (id) =>
        new Experimental_EvaluationMockModelV4({ modelId: id, doEvaluate: upstream }),
    };

    const operation = gateway.operation({
      operation: 'evaluate',
      model: 'typesafe-ai/jev',
      context: { tenant: 'a' },
    });

    await operation.start();

    const result = await experimental_evaluate({
      model: operation.evaluationModel(),
      state: { refunded: true },
      questions,
    });

    await operation.finish();
    await operation.finish();

    expect(result.usage).toEqual({
      inputTokens: 14,
      outputTokens: undefined,
      totalTokens: undefined,
    });
    expect(upstream.mock.calls[0][0].headers?.['x-eval']).toBe('test');
    expect(phases).toEqual([
      'beforeOperation',
      'beforeUpstream',
      'afterUpstream',
      'afterOperation',
    ]);
    expect(afterUpstream).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: operation.requestId,
        context: operation.context,
        usage: { inputTokens: 14, outputTokens: 0, totalTokens: 14 },
      }),
    );
    expect(afterOperation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        requestId: operation.requestId,
        context: operation.context,
        model: 'typesafe-ai/jev',
        usage: { inputTokens: 14, outputTokens: 0, totalTokens: 14 },
      }),
    );
  });

  it('reports upstream failures to afterError and to the finished operation', async () => {
    const error = new Error('upstream failure');
    const afterError = vi.fn();
    const afterOperation = vi.fn();
    const gateway = createGateway({
      providers: { 'typesafe-ai': { apiKey: 'secret' } },
      hooks: { afterError: [afterError], afterOperation: [afterOperation] },
    });
    const provider = gateway.registry['typesafe-ai']!;

    gateway.registry['typesafe-ai'] = {
      ...provider,
      evaluationModel: (id) =>
        new Experimental_EvaluationMockModelV4({
          modelId: id,
          doEvaluate: () => Promise.reject(error),
        }),
    };

    const operation = gateway.operation({ operation: 'evaluate', model: 'typesafe-ai/jev' });

    await operation.start();

    await expect(
      experimental_evaluate({
        model: operation.evaluationModel(),
        state: 'A refund was issued',
        questions,
        maxRetries: 0,
      }),
    ).rejects.toBe(error);

    await operation.finish({ error });

    expect(afterError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        requestId: operation.requestId,
        failedPhase: 'upstream',
        error,
      }),
    );
    expect(afterOperation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error }));
  });
});

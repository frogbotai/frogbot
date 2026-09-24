import type { Gateway } from '@frogbotai/gateway';
import { Experimental_EvaluationMockModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { evaluateOperation } from '../../../../../packages/frogbot/src/ai/operations/evaluate.js';
import type { SanitizedAIConfig } from '../../../../../packages/frogbot/src/ai/types.js';

const questions = {
  refunded: { type: 'boolean', instructions: 'Was the order refunded?' },
  team: {
    type: 'choice',
    instructions: 'Which team?',
    criteria: { billing: 'Billing', support: 'Support' },
  },
  severity: { type: 'score', instructions: 'How severe?', criteria: ['Low', 'High'] },
} as const;

function makeConfig(evaluate: SanitizedAIConfig['access']['evaluate'] = () => true) {
  return {
    providers: { 'typesafe-ai': { apiKey: 'ts-test' } },
    routers: { judge: { model: 'typesafe-ai/jev' } },
    hooks: {
      beforeOperation: [],
      beforeUpstream: [],
      afterUpstream: [],
      afterError: [],
      afterOperation: [],
    },
    access: {
      generate: () => true,
      embed: () => true,
      transcribe: () => true,
      rerank: () => true,
      evaluate,
    },
    telemetry: { enabled: false },
    _internal: { deploymentId: 'test' },
  } satisfies SanitizedAIConfig;
}

function makeGateway(model: Experimental_EvaluationMockModelV4) {
  const events: string[] = [];
  const start = vi.fn(async () => {
    events.push('start');
  });
  const finish = vi.fn(async () => {
    events.push('finish');
  });
  const evaluationModel = vi.fn(() => model);
  const operation = vi.fn(() => ({ start, finish, evaluationModel }));
  const gateway = { operation } as unknown as Gateway;

  return { gateway, operation, start, finish, evaluationModel, events };
}

describe('evaluateOperation', () => {
  it('resolves router aliases and preserves mixed SDK answers, usage, rounding, and metadata', async () => {
    const doEvaluate = vi.fn(async () => ({
      answers: {
        refunded: { type: 'boolean' as const, probability: 0.85 },
        team: {
          type: 'choice' as const,
          choice: 'billing',
          probabilities: { billing: 0.75, support: 0.25 },
        },
        severity: {
          type: 'score' as const,
          score: 0.75,
          probabilities: { '0': 0.25, '1': 0.75 },
        },
      },
      usage: { inputTokens: 120, outputTokens: 0 },
      warnings: [],
      rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
      providerMetadata: { typesafe: { confidence: { refunded: 0.98 } } },
      response: { modelId: 'jev-1.13.0', id: 'eval-1' },
    }));
    const model = new Experimental_EvaluationMockModelV4({ doEvaluate });
    const { gateway, operation, start, finish, evaluationModel, events } = makeGateway(model);

    const result = await evaluateOperation(
      { gateway, config: makeConfig() },
      { model: 'judge' as never, state: { refund: true }, questions, maxRetries: 0 },
    );

    expect(operation).toHaveBeenCalledWith({
      operation: 'evaluate',
      model: 'typesafe-ai/jev',
      context: { req: undefined },
    });
    expect(start).toHaveBeenCalledOnce();
    expect(evaluationModel).toHaveBeenCalledOnce();
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({ state: { refund: true }, questions }),
    );
    expect(result.answers.team.choice).toBe('billing');
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 0, totalTokens: 120 });
    expect(result.rounding).toEqual({ probabilityDecimals: 2, scoreDecimals: 2 });
    expect(result.providerMetadata).toEqual({ typesafe: { confidence: { refunded: 0.98 } } });
    expect(result.response).toMatchObject({ modelId: 'jev-1.13.0', id: 'eval-1' });
    expect(result.response.timestamp).toBeInstanceOf(Date);
    expect(finish).toHaveBeenCalledExactlyOnceWith();
    expect(events).toEqual(['start', 'finish']);
  });

  it('finishes with the SDK error once when an upstream answer is invalid', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      doEvaluate: async () => ({
        answers: { refunded: { type: 'boolean', probability: 2 } },
        warnings: [],
      }),
    });
    const { gateway, finish } = makeGateway(model);

    await expect(
      evaluateOperation(
        { gateway, config: makeConfig() },
        {
          model: 'typesafe-ai/jev',
          state: 'A refund was issued.',
          questions: { refunded: questions.refunded },
          maxRetries: 0,
        },
      ),
    ).rejects.toThrow();

    expect(finish).toHaveBeenCalledExactlyOnceWith({ error: expect.any(Error) });
  });

  it('enforces the requested alias before resolving the model or contacting the gateway', async () => {
    const model = new Experimental_EvaluationMockModelV4();
    const { gateway, operation } = makeGateway(model);

    await expect(
      evaluateOperation(
        { gateway, config: makeConfig() },
        {
          model: 'judge' as never,
          state: 'State',
          questions: { refunded: questions.refunded },
          req: { user: { modelAccess: 'selected', models: ['typesafe-ai/jev'] } } as never,
        },
      ),
    ).rejects.toMatchObject({ status: 403, code: 'model_not_allowed' });

    expect(operation).not.toHaveBeenCalled();
  });

  it('denies request-bound evaluation access before contacting the gateway', async () => {
    const model = new Experimental_EvaluationMockModelV4();
    const { gateway, operation } = makeGateway(model);

    await expect(
      evaluateOperation(
        { gateway, config: makeConfig(() => false) },
        {
          model: 'typesafe-ai/jev',
          state: 'State',
          questions: { refunded: questions.refunded },
          req: { user: { id: 'user-1' } } as never,
        },
      ),
    ).rejects.toThrow('Access denied for AI evaluate');

    expect(operation).not.toHaveBeenCalled();
  });

  it('allows trusted local calls with overrideAccess and no request', async () => {
    const model = new Experimental_EvaluationMockModelV4({
      doEvaluate: async () => ({
        answers: { refunded: { type: 'boolean', probability: 0.9 } },
        warnings: [],
      }),
    });
    const { gateway, finish } = makeGateway(model);
    const config = makeConfig(() => false);

    const trusted = await evaluateOperation(
      { gateway, config },
      {
        model: 'typesafe-ai/jev',
        state: 'State',
        questions: { refunded: questions.refunded },
        req: { user: { modelAccess: 'selected', models: [] } } as never,
        overrideAccess: true,
      },
    );

    const local = await evaluateOperation(
      { gateway, config },
      { model: 'typesafe-ai/jev', state: 'State', questions: { refunded: questions.refunded } },
    );

    expect(trusted.answers.refunded.probability).toBe(0.9);
    expect(local.answers.refunded.probability).toBe(0.9);
    expect(finish).toHaveBeenCalledTimes(2);
  });
});

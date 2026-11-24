import type { Gateway } from '@frogbotai/gateway';
import { experimental_evaluate } from 'ai';

import type { FrogBotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { resolveModel } from '../resolve.js';
import type {
  EvaluateOpts,
  EvaluateResult,
  EvaluationQuestion,
  SanitizedAIConfig,
} from '../types.js';

const STATE_PART_TYPES = new Set(['text', 'file', 'json']);

function assertStateParts(state: unknown): void {
  if (!Array.isArray(state)) return;

  const parts = state.every(
    (part: unknown) =>
      !!part &&
      typeof part === 'object' &&
      STATE_PART_TYPES.has(String((part as { type?: unknown }).type)),
  );

  if (!parts) {
    throw new TypeError(
      "[frogbot] evaluate state: an array must hold state parts ({ type: 'text' | 'file' | 'json' }). Wrap a JSON array as [{ type: 'json', value: array }].",
    );
  }
}

export type EvaluateDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
};

export async function evaluateOperation<const QUESTIONS extends Record<string, EvaluationQuestion>>(
  deps: EvaluateDeps,
  opts: EvaluateOpts<QUESTIONS>,
): Promise<EvaluateResult<QUESTIONS>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  assertStateParts(aiSdkOpts.state);

  const modelId = resolveModel(input, config);

  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogBotRequest,
      method: 'evaluate',
      model: input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'evaluate',
    model: modelId,
    context: { req: req as FrogBotRequest | undefined },
  });

  await op.start();

  let result: EvaluateResult<QUESTIONS>;

  try {
    result = await experimental_evaluate<QUESTIONS>({
      ...aiSdkOpts,
      model: op.evaluationModel(),
    });
  } catch (error) {
    await op.finish({ error });

    throw error;
  }

  await op.finish();

  return result;
}

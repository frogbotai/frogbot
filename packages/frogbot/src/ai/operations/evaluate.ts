import type { Gateway } from '@frogbotai/gateway';
import { experimental_evaluate } from 'ai';

import type { FrogBotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { enforcePolicy } from '../policy.js';
import { resolveModel } from '../resolve.js';
import type {
  EvaluateOpts,
  EvaluateResult,
  EvaluationQuestion,
  SanitizedAIConfig,
} from '../types.js';

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

  if (shouldEnforceAccess && req) enforcePolicy({ req: req as FrogBotRequest, target: input });

  const modelId = resolveModel(input, config);

  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogBotRequest,
      method: 'evaluate',
      input,
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

import type { Gateway } from '@frogbotai/gateway';
import { rerank as aiRerank } from 'ai';

import type { Logger } from '../../frogbot.js';
import type { FrogBotRequest } from '../../types/request.js';
import { enforceAIAccess } from '../access.js';
import { resolveModel } from '../resolve.js';
import type { RerankOpts, SanitizedAIConfig } from '../types.js';

export type RerankDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function rerankOperation(
  deps: RerankDeps,
  opts: RerankOpts,
): Promise<Awaited<ReturnType<typeof aiRerank<string>>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  const modelId = resolveModel(input, config);

  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogBotRequest,
      method: 'rerank',
      model: input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'rerank',
    model: modelId,
    context: { req: req as FrogBotRequest | undefined },
  });

  await op.start();

  try {
    const result = await aiRerank({ ...aiSdkOpts, model: op.rerankModel() });
    await op.finish();

    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}

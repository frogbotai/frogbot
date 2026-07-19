// rerank operation — rerank documents by relevance to a query.
// Uses ProxyRerankingModel pointed at the proxy URL.

import { rerank as aiRerank } from 'ai';

import type { RerankOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Logger } from '../../frogbot.js';
import type { Gateway } from '@frogbotai/gateway';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';

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

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'rerank',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'rerank',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
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

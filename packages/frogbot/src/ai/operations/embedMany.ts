// embedMany operation — batch embedding for multiple values.

import { embedMany as aiEmbedMany } from 'ai';

import type { EmbedManyOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Logger } from '../../frogbot.js';
import type { Gateway } from '@frogbotai/gateway';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';
import { toHookUsage } from '../hooks.js';

export type EmbedManyDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function embedManyOperation(
  deps: EmbedManyDeps,
  opts: EmbedManyOpts,
): Promise<Awaited<ReturnType<typeof aiEmbedMany>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'embedMany',
      input,
      config,
    });
  }

  const op = gateway.operation({
    operation: 'embeddings',
    model: modelId,
    context: { req: req as FrogbotRequest | undefined },
  });
  await op.start();

  try {
    const result = await aiEmbedMany({ ...aiSdkOpts, model: op.embedModel() });
    await op.finish({ usage: toHookUsage(result.usage) });
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}

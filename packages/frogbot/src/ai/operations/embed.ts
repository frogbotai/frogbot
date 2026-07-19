// embed operation — single value embedding.

import { embed as aiEmbed } from 'ai';

import type { EmbedOpts, SanitizedAIConfig } from '../../types/ai.js';
import type { FrogbotRequest } from '../../types/request.js';
import type { Logger } from '../../frogbot.js';
import type { Gateway } from '@frogbotai/gateway';
import { resolveModel } from '../resolve.js';
import { enforceAIAccess } from '../access.js';
import { toHookUsage } from '../hooks.js';

export type EmbedDeps = {
  gateway: Gateway;
  config: SanitizedAIConfig;
  logger: Logger;
};

export async function embedOperation(deps: EmbedDeps, opts: EmbedOpts): Promise<Awaited<ReturnType<typeof aiEmbed>>> {
  const { gateway, config } = deps;
  const { model: input, req, overrideAccess, ...aiSdkOpts } = opts;
  const shouldEnforceAccess = overrideAccess === false || (overrideAccess === undefined && !!req);

  // 1. Resolve model.
  const modelId = resolveModel(input, config);

  // 2. Access control.
  if (shouldEnforceAccess && req) {
    await enforceAIAccess({
      req: req as FrogbotRequest,
      method: 'embed',
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
    const result = await aiEmbed({ ...aiSdkOpts, model: op.embedModel() });
    await op.finish({ usage: toHookUsage(result.usage) });
    return result;
  } catch (error) {
    await op.finish({ error });
    throw error;
  }
}

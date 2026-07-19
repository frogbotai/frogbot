import type { Hooks } from '../hooks.js';

import { anthropicBeforeUpstream } from './anthropic/middleware.js';
import { bedrockBeforeUpstream } from './bedrock/middleware.js';
import { cohereBeforeUpstream } from './cohere/middleware.js';
import { googleBeforeUpstream } from './google/middleware.js';
import { openaiBeforeUpstream } from './openai/middleware.js';
import { vertexBeforeUpstream } from './vertex/middleware.js';
import { voyageBeforeUpstream } from './voyage/middleware.js';

export function getProviderHooks(providerName: string): Hooks {
  if (providerName === 'anthropic') return { beforeUpstream: anthropicBeforeUpstream };
  if (providerName === 'amazon-bedrock') return { beforeUpstream: bedrockBeforeUpstream };
  if (providerName === 'cohere') return { beforeUpstream: cohereBeforeUpstream };
  if (providerName === 'google') return { beforeUpstream: googleBeforeUpstream };
  if (providerName === 'openai') return { beforeUpstream: openaiBeforeUpstream };
  if (providerName === 'vertex') return { beforeUpstream: vertexBeforeUpstream };
  if (providerName === 'voyage') return { beforeUpstream: voyageBeforeUpstream };
  return {};
}

/**
 * Combine multiple `Hooks` objects into one, per lifecycle phase.
 *
 * Hooks are CONCATENATED (flatMap) per phase, not merged/overwritten by key —
 * every hook from every source runs. Execution order follows argument order:
 * hooks from earlier args run before hooks from later args. Call sites use
 * `mergeHooks(getProviderHooks(providerName), ctx.hooks ?? {})`, so PROVIDER
 * hooks run before USER hooks. Within a single arg, hooks run in array index
 * order (left-to-right). This applies identically to all five phases
 * (beforeOperation, beforeUpstream, afterUpstream, afterError, afterOperation).
 * "Last wins" is only a consequence of execution order, not a merge contract.
 */
export function mergeHooks(...hooks: Hooks[]): Hooks {
  return {
    beforeOperation: hooks.flatMap((h) => h.beforeOperation ?? []),
    beforeUpstream: hooks.flatMap((h) => h.beforeUpstream ?? []),
    afterUpstream: hooks.flatMap((h) => h.afterUpstream ?? []),
    afterError: hooks.flatMap((h) => h.afterError ?? []),
    afterOperation: hooks.flatMap((h) => h.afterOperation ?? []),
  };
}

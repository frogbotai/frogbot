// Bedrock-specific beforeUpstream middleware.
//
// `bedrockCachePoint` — injects `cachePoint` markers at Bedrock-specific positions
// for models that support prompt caching (Claude on Bedrock).

import type { BeforeUpstreamHook } from '../../hooks.js';

/**
 * Injects Bedrock cache point markers into providerOptions when the model
 * supports prompt caching. Bedrock uses explicit `cachePoint` objects rather
 * than Anthropic's `cache_control` field.
 *
 * Only fires for Anthropic models on Bedrock (identified by `anthropic.` prefix).
 */
export const bedrockCachePoint: BeforeUpstreamHook = (args) => {
  const providerOptions = args.providerOptions;
  if (!providerOptions) return;

  // Only apply to Anthropic models on Bedrock.
  const model = args.model;
  if (!model.includes('anthropic.') && !model.includes('claude')) return;

  // If the user set `cache_control` in the unknown namespace, convert it to
  // Bedrock's `cachePoint` format under the `bedrock` namespace — the shipped
  // SDK reads cachePoint from `bedrock`/`amazonBedrock`, never the hyphenated
  // `amazon-bedrock` string.
  const unknown = providerOptions['unknown'];
  if (!unknown?.['cache_control']) return;

  const bedrock = (providerOptions['bedrock'] ??= {});
  bedrock['cachePoint'] = { type: 'default' };

  // Remove cache_control from unknown since Bedrock doesn't support it directly.
  delete unknown['cache_control'];
};

/**
 * Re-homes the neutral `unknown.dimensions` embedding knob into Bedrock's
 * model-family-specific dimension key. Bedrock embedding models differ:
 *   - Nova (`amazon.nova-*embed`): `embeddingDimension`
 *   - Cohere-on-Bedrock (`cohere.embed-*`): `outputDimension`
 *   - Titan (default): `dimensions`
 * (per @ai-sdk/amazon-bedrock amazon-bedrock-embedding-model.ts). Written under
 * the `bedrock` namespace, which the shipped SDK reads (with `amazonBedrock`).
 */
export const bedrockEmbedDimensions: BeforeUpstreamHook = (args) => {
  if (args.operation !== 'embeddings') return;

  const unknown = args.providerOptions.unknown;
  const dimensions = unknown?.dimensions;
  if (typeof dimensions !== 'number') return;

  const modelId = args.model.split('/').pop() ?? '';
  const isNova = modelId.startsWith('amazon.nova-') && modelId.includes('embed');
  const isCohere = modelId.includes('cohere.embed-');
  const key = isNova ? 'embeddingDimension' : isCohere ? 'outputDimension' : 'dimensions';

  args.providerOptions.bedrock = {
    ...(args.providerOptions.bedrock ?? {}),
    [key]: dimensions,
  };
  delete unknown.dimensions;
};

export const bedrockBeforeUpstream: BeforeUpstreamHook[] = [bedrockCachePoint, bedrockEmbedDimensions];

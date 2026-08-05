// Bedrock-specific beforeUpstream middleware.
//
// `bedrockCachePoint` — injects `cachePoint` markers at Bedrock-specific positions
// for models that support prompt caching (Claude on Bedrock).

import type { BeforeUpstreamHook } from '../../hooks.js';
import { calculateReasoningBudgetFromEffort } from '../../utils/params.js';

/**
 * Injects Bedrock cache point markers into providerOptions when the model
 * supports prompt caching. Bedrock uses explicit `cachePoint` objects rather
 * than Anthropic's `cache_control` field.
 *
 * Only fires for Anthropic models on Bedrock (identified by `anthropic.` prefix).
 */
export const bedrockCachePoint: BeforeUpstreamHook = (args) => {
  const model = args.model;
  if (!model.includes('anthropic.') && !model.includes('claude')) return;

  const processProviderOptions = (providerOptions?: Record<string, Record<string, unknown>>) => {
    if (!providerOptions) return;
    const unknown = providerOptions.unknown;
    const cacheControl = unknown?.cache_control;
    if (!cacheControl || typeof cacheControl !== 'object') return;

    const ttl = (cacheControl as Record<string, unknown>).ttl;
    (providerOptions.bedrock ??= {}).cachePoint = {
      type: 'default',
      ...(ttl === '5m' || ttl === '1h' ? { ttl } : {}),
    };
    delete unknown.cache_control;
    if (Object.keys(unknown).length === 0) delete providerOptions.unknown;
  };

  let lastMessage: Record<string, unknown> | undefined;
  for (const value of args.messages ?? []) {
    if (!value || typeof value !== 'object') continue;
    const message = value as Record<string, unknown>;
    lastMessage = message;
    processProviderOptions(message.providerOptions as Record<string, Record<string, unknown>> | undefined);

    if (!Array.isArray(message.content)) continue;
    for (const value of message.content) {
      if (!value || typeof value !== 'object') continue;
      const part = value as Record<string, unknown>;
      processProviderOptions(part.providerOptions as Record<string, Record<string, unknown>> | undefined);
    }
  }

  const requestCacheControl = args.providerOptions.unknown?.cache_control;
  if (requestCacheControl && lastMessage) {
    const providerOptions = (lastMessage.providerOptions ??= {}) as Record<string, Record<string, unknown>>;
    providerOptions.unknown = { ...(providerOptions.unknown ?? {}), cache_control: requestCacheControl };
    processProviderOptions(providerOptions);
    delete args.providerOptions.unknown.cache_control;
    if (Object.keys(args.providerOptions.unknown).length === 0) delete args.providerOptions.unknown;
  }
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

/**
 * Translates the cross-provider `reasoning_effort` param into Bedrock's native
 * `reasoningConfig`. Runs before `forwardLanguageParams` drains the `unknown`
 * namespace for Bedrock. Only fires for Claude; explicit `reasoningConfig` wins.
 */
export const bedrockThinkingEffort: BeforeUpstreamHook = (args) => {
  if (!args.model.includes('claude') && !args.model.includes('anthropic.')) return;

  const bedrockOpts = args.providerOptions['bedrock'] as { reasoningConfig?: unknown } | undefined;
  const amazonBedrockOpts = args.providerOptions['amazonBedrock'] as { reasoningConfig?: unknown } | undefined;
  if (bedrockOpts?.reasoningConfig || amazonBedrockOpts?.reasoningConfig) return;

  const unknown = args.providerOptions['unknown'];
  const effort = unknown?.['reasoning_effort'];
  if (typeof effort !== 'string') return;

  const budgetTokens = calculateReasoningBudgetFromEffort(effort, args.params?.maxOutputTokens);
  if (budgetTokens <= 0) return;

  args.providerOptions['bedrock'] = {
    ...(args.providerOptions['bedrock'] ?? {}),
    reasoningConfig: { type: 'enabled', budgetTokens },
  };
};

export const bedrockBeforeUpstream: BeforeUpstreamHook[] = [bedrockThinkingEffort, bedrockCachePoint, bedrockEmbedDimensions];

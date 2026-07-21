// Provider registry — constructs AI SDK provider instances from gateway config.
//
// Each provider is defined in its own folder (`providers/<name>/index.ts`)
// and registered in the `providers` table below. Adding a provider means:
//   1. Create `providers/<name>/index.ts` with an object that
//      `satisfies ProviderDefinition<...>`.
//   2. Add a row to `providers` here.
// Everything downstream (config types, instance types, CLI
// env-detect) is derived from the table via the `ProviderDefinition` generics
// — there are no per-provider conditionals in this file.

import type {
  EmbeddingModelV3,
  EmbeddingModelV4,
  Experimental_VideoModelV4,
  ImageModelV4,
  LanguageModelV3,
  LanguageModelV4,
  RerankingModelV3,
  RerankingModelV4,
  SpeechModelV3,
  SpeechModelV4,
  TranscriptionModelV3,
  TranscriptionModelV4,
} from '@ai-sdk/provider';

import { alibabaProvider } from './alibaba/index.js';
import { anthropicProvider } from './anthropic/index.js';
import { anthropicAwsProvider } from './anthropic-aws/index.js';
import { assemblyaiProvider } from './assemblyai/index.js';
import { azureProvider } from './azure/index.js';
import { basetenProvider } from './baseten/index.js';
import { bedrockProvider } from './bedrock/index.js';
import { blackForestLabsProvider } from './black-forest-labs/index.js';
import { bytedanceProvider } from './bytedance/index.js';
import { cerebrasProvider } from './cerebras/index.js';
import { cohereProvider } from './cohere/index.js';
import { deepgramProvider } from './deepgram/index.js';
import { deepinfraProvider } from './deepinfra/index.js';
import { deepseekProvider } from './deepseek/index.js';
import { falProvider } from './fal/index.js';
import { fireworksProvider } from './fireworks/index.js';
import { googleProvider } from './google/index.js';
import { gladiaProvider } from './gladia/index.js';
import { groqProvider } from './groq/index.js';
import { humeProvider } from './hume/index.js';
import { huggingfaceProvider } from './huggingface/index.js';
import { klingaiProvider } from './klingai/index.js';
import { elevenlabsProvider } from './elevenlabs/index.js';
import { lmntProvider } from './lmnt/index.js';
import { lumaProvider } from './luma/index.js';
import { mistralProvider } from './mistral/index.js';
import { moonshotaiProvider } from './moonshotai/index.js';
import { openaiProvider } from './openai/index.js';
import {
  buildOpenAICompatibleProvider,
  type OpenAICompatibleConfig,
} from './openai-compatible/index.js';
import { perplexityProvider } from './perplexity/index.js';
import { prodiaProvider } from './prodia/index.js';
import { replicateProvider } from './replicate/index.js';
import { togetheraiProvider } from './togetherai/index.js';
import { vercelProvider } from './vercel/index.js';
import { vertexProvider } from './vertex/index.js';
import { voyageProvider } from './voyage/index.js';
import { xaiProvider } from './xai/index.js';
import type { ProviderDefinition } from './types.js';
import { resolveAnthropicAwsModelId } from './anthropic-aws/canonical.js';
import { resolveAzureModelId } from './azure/canonical.js';
import { resolveBedrockModelId } from './bedrock/canonical.js';
import {
  ModelIdError,
  ModelNotFoundError,
  ModelUnsupportedOperationError,
  NoProvidersError,
  ProviderNotConfiguredError,
  UnsupportedModalityError,
} from '../errors/gatewayError.js';
import { type Operation, type ModelCatalog, supportsOperation } from './catalog.js';

// ---------------------------------------------------------------------------
// Provider table — the single source of truth for known providers.
// ---------------------------------------------------------------------------

export const providers = {
  alibaba: alibabaProvider,
  anthropic: anthropicProvider,
  'anthropic-aws': anthropicAwsProvider,
  assemblyai: assemblyaiProvider,
  'amazon-bedrock': bedrockProvider,
  azure: azureProvider,
  baseten: basetenProvider,
  'black-forest-labs': blackForestLabsProvider,
  bytedance: bytedanceProvider,
  cerebras: cerebrasProvider,
  cohere: cohereProvider,
  deepgram: deepgramProvider,
  deepinfra: deepinfraProvider,
  deepseek: deepseekProvider,
  elevenlabs: elevenlabsProvider,
  fal: falProvider,
  fireworks: fireworksProvider,
  gladia: gladiaProvider,
  google: googleProvider,
  groq: groqProvider,
  hume: humeProvider,
  huggingface: huggingfaceProvider,
  klingai: klingaiProvider,
  lmnt: lmntProvider,
  luma: lumaProvider,
  mistral: mistralProvider,
  moonshotai: moonshotaiProvider,
  openai: openaiProvider,
  perplexity: perplexityProvider,
  prodia: prodiaProvider,
  replicate: replicateProvider,
  togetherai: togetheraiProvider,
  vercel: vercelProvider,
  vertex: vertexProvider,
  voyage: voyageProvider,
  xai: xaiProvider,
} as const;

export type ProviderName = keyof typeof providers;
export const PROVIDER_NAMES = Object.keys(providers) as ProviderName[];

export type GatewayLanguageModel = LanguageModelV4 | LanguageModelV3;
export type GatewayEmbeddingModel = EmbeddingModelV4 | EmbeddingModelV3;
export type GatewaySpeechModel = SpeechModelV4 | SpeechModelV3;
export type GatewayTranscriptionModel = TranscriptionModelV4 | TranscriptionModelV3;
export type GatewayRerankingModel = RerankingModelV4 | RerankingModelV3;

// ---------------------------------------------------------------------------
// Derived types — extracted from each entry's `ProviderDefinition` generics.
// ---------------------------------------------------------------------------

/** The config shape required by provider `K`. */
type ConfigOf<K extends ProviderName> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof providers)[K] extends ProviderDefinition<string, infer TConfig, any> ? TConfig : never;

/** The AI SDK instance type returned by provider `K`'s `build`. */
type InstanceOf<K extends ProviderName> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof providers)[K] extends ProviderDefinition<string, any, infer TInstance> ? TInstance : never;

/** Union of every provider's AI SDK instance type. Grows automatically with the table. */
export type AIProvider = {
  [K in ProviderName]: InstanceOf<K>;
}[ProviderName] & {
  languageModel: (modelId: string) => GatewayLanguageModel;
  embeddingModel: (modelId: string) => GatewayEmbeddingModel;
  imageModel: (modelId: string) => ImageModelV4;
  videoModel?: (modelId: string) => Experimental_VideoModelV4;
  speechModel?: (modelId: string) => GatewaySpeechModel;
  transcriptionModel?: (modelId: string) => GatewayTranscriptionModel;
  rerankingModel?: (modelId: string) => GatewayRerankingModel;
};

/**
 * Per-provider config map — the loose *runtime* representation used internally
 * (merge, validation, registry build). Known provider keys carry their precise
 * config or a pre-built instance; any other key is a generic OpenAI-compatible
 * endpoint. The public entry points (`createGateway`, `defineConfig`) apply the
 * stricter per-key {@link ProvidersInput} constraint so authoring a config
 * literal gets exact known-key checking that an index signature can't express
 * (see microsoft/TypeScript#17867).
 */
export type ProviderConfigMap = { [K in ProviderName]?: ConfigOf<K> | InstanceOf<K> } & {
  [name: string]: OpenAICompatibleConfig | AIProvider | undefined;
};

/**
 * Authoring constraint for a `providers` object literal. Applied via a generic
 * on the public entry points. For each key the caller actually writes:
 *   - a known provider name → that provider's typed config or a pre-built instance;
 *   - any other key → a generic {@link OpenAICompatibleConfig} (`baseURL` required)
 *     or a pre-built provider instance (duck-typed via {@link ProviderInstanceShape}).
 * This is the per-key branch a string index signature cannot do. The unknown-key
 * branch intentionally uses the minimal instance shape rather than {@link AIProvider}:
 * the full union of built-in instance types can contain an `any`, which would
 * collapse the branch and defeat the `baseURL`-required check.
 */
export type ProvidersInput<C> = {
  [K in keyof C]: K extends ProviderName
    ? ConfigOf<K> | InstanceOf<K>
    : OpenAICompatibleConfig | ProviderInstanceShape;
};

/** Minimal duck-typed provider instance — mirrors {@link isProviderInstance}. */
export type ProviderInstanceShape = {
  languageModel: (modelId: string) => unknown;
  embeddingModel: (modelId: string) => unknown;
};

/** Constructed registry: each key carries that provider's specific instance type. */
export type ProviderRegistry = { [K in ProviderName]?: InstanceOf<K> } & {
  [name: string]: AIProvider | undefined;
};

// ---------------------------------------------------------------------------
// Builder (eager — used by createGateway)
// ---------------------------------------------------------------------------

function buildOne<K extends ProviderName>(name: K, cfg: ConfigOf<K>): InstanceOf<K> {
  return providers[name].build(cfg as never) as InstanceOf<K>;
}

/**
 * Duck-type a value as a pre-built AI SDK provider instance. All `ProviderV2`+
 * instances expose `languageModel` and `embeddingModel` as functions
 * (`ai/packages/provider/src/provider/v2/provider-v2.ts`); shorthand configs
 * are plain option bags with no such methods.
 */
export function isProviderInstance(value: unknown): value is AIProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { languageModel?: unknown }).languageModel === 'function' &&
    typeof (value as { embeddingModel?: unknown }).embeddingModel === 'function'
  );
}

export function buildProviderRegistry(configProviders: ProviderConfigMap): ProviderRegistry {
  // Null prototype: prevents prototype-chain lookups (`constructor`, `__proto__`,
  // `toString`, ...) from resolving to Object.prototype members, and prevents a
  // hostile provider `name` from mutating Object.prototype.
  const registry: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const knownNames = new Set<string>(PROVIDER_NAMES);
  for (const [name, cfg] of Object.entries(configProviders)) {
    if (cfg === undefined) {
      continue;
    }
    // A pre-built instance is used as-is (config shape #2); `fromEnv` and
    // shorthand `build` are intentionally bypassed — the user already
    // constructed and configured it.
    if (isProviderInstance(cfg)) {
      registry[name] = cfg;
    } else if (knownNames.has(name)) {
      registry[name] = buildOne(name as ProviderName, cfg as ConfigOf<ProviderName>);
    } else {
      // Any key that isn't a built-in provider is a generic OpenAI-compatible
      // endpoint. The map key supplies the provider name.
      registry[name] = buildOpenAICompatibleProvider(name, cfg as OpenAICompatibleConfig);
    }
  }
  return registry as ProviderRegistry;
}

// ---------------------------------------------------------------------------
// Canonical model-ID resolution — friendly aliases are resolved to the exact
// IDs the upstream API requires before the AI SDK sees them (e.g.
// `amazon-bedrock/claude-4-sonnet` → `anthropic.claude-sonnet-4-20250514-v1:0`).
// Full IDs pass through unchanged.
// ---------------------------------------------------------------------------

const canonicalIdResolvers = new Map<string, (modelId: string) => string>([
  ['amazon-bedrock', resolveBedrockModelId],
  ['anthropic-aws', resolveAnthropicAwsModelId],
  ['azure', resolveAzureModelId],
]);

// ---------------------------------------------------------------------------
// resolveProvider — the canonical M2 resolver
// ---------------------------------------------------------------------------

export type ResolveProviderArgs = {
  /** The full canonical model ID (e.g. `openai/gpt-4o`). */
  modelId: string;
  /** The operation being requested. */
  operation: Operation;
  /** The constructed provider registry. */
  providers: ProviderRegistry;
  /** Optional model catalog for operation validation. */
  models?: ModelCatalog;
};

export type ResolvedProvider = {
  /** The provider key (e.g. `openai`). */
  providerName: string;
  /**
   * The model segment after the provider prefix, with friendly aliases
   * resolved to the provider's canonical form (Bedrock/Azure/Anthropic-AWS).
   */
  modelName: string;
  /** The AI SDK provider instance. */
  instance: AIProvider;
};

/**
 * Resolve a canonical `<provider>/<model>` ID to a provider instance with
 * operation validation.
 *
 * Throws:
 *   - `NoProvidersError` — registry is completely empty.
 *   - `ModelIdError` — model ID is malformed.
 *   - `ModelNotFoundError` — provider segment is unknown.
 *   - `ProviderNotConfiguredError` — known provider is not in the passed registry.
 *   - `ModelUnsupportedOperationError` — catalog says this model doesn't
 *      support the requested operation.
 */
export function resolveProvider(args: ResolveProviderArgs): ResolvedProvider {
  const { modelId, operation, providers: registry, models } = args;

  // Guard: at least one provider must be configured.
  const configuredProviders = Object.keys(registry).filter(
    (k) => registry[k as keyof ProviderRegistry] != null,
  );
  if (configuredProviders.length === 0) {
    throw new NoProvidersError();
  }

  // Parse the model ID — split on first `/` only.
  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new ModelIdError(String(modelId));
  }
  const slashIndex = modelId.indexOf('/');
  if (slashIndex <= 0 || slashIndex === modelId.length - 1) {
    throw new ModelIdError(modelId);
  }

  const providerName = modelId.slice(0, slashIndex);
  const modelName = modelId.slice(slashIndex + 1);

  // Look up the provider in the registry. Own-property checks only —
  // prototype keys (`constructor`, `__proto__`, ...) must resolve to
  // ModelNotFoundError, not Object.prototype members.
  const instance = Object.hasOwn(registry, providerName)
    ? registry[providerName as keyof ProviderRegistry]
    : undefined;
  if (!instance) {
    if (Object.hasOwn(providers, providerName)) {
      throw new ProviderNotConfiguredError(providerName);
    }
    throw new ModelNotFoundError(modelId);
  }

  // If a catalog is provided, validate the operation is supported.
  if (models) {
    const entry = models.get(modelId);
    if (entry && !supportsOperation(entry, operation)) {
      throw new ModelUnsupportedOperationError({ modelId, operation });
    }
  }

  return {
    providerName,
    modelName: canonicalIdResolvers.get(providerName)?.(modelName) ?? modelName,
    instance,
  };
}

export function requireVideoModel(args: {
  provider: AIProvider;
  providerName: string;
  modelName: string;
}): Experimental_VideoModelV4 {
  if (!args.provider.videoModel) {
    throw new UnsupportedModalityError({
      provider: args.providerName,
      modality: 'video',
      param: 'model',
    });
  }
  return args.provider.videoModel(args.modelName);
}

export function requireSpeechModel(args: {
  provider: AIProvider;
  providerName: string;
  modelName: string;
}): GatewaySpeechModel {
  if (!args.provider.speechModel) {
    throw new UnsupportedModalityError({
      provider: args.providerName,
      modality: 'speech',
      param: 'model',
    });
  }
  return args.provider.speechModel(args.modelName);
}

export function requireTranscriptionModel(args: {
  provider: AIProvider;
  providerName: string;
  modelName: string;
}): GatewayTranscriptionModel {
  if (!args.provider.transcriptionModel) {
    throw new UnsupportedModalityError({
      provider: args.providerName,
      modality: 'transcription',
      param: 'model',
    });
  }
  return args.provider.transcriptionModel(args.modelName);
}

export function requireRerankingModel(args: {
  provider: AIProvider;
  providerName: string;
  modelName: string;
}): GatewayRerankingModel {
  if (!args.provider.rerankingModel) {
    throw new UnsupportedModalityError({
      provider: args.providerName,
      modality: 'rerank',
      param: 'model',
    });
  }
  return args.provider.rerankingModel(args.modelName);
}

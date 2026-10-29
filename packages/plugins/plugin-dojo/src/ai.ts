import type { ModelCatalogEntry } from '@frogbotai/gateway';
import { canonicalizeModelId, DEFAULT_MODEL_CATALOG, providerKeyEnvVar } from '@frogbotai/gateway';
import type { AIConfig, FrogBotConfig, ModelId, OnInit, RouterConfig } from 'frogbot';

import type { DojoEnv } from './env.js';

type CustomProviderEntry = Extract<
  NonNullable<AIConfig['providers'][string]>,
  { type: 'openai-compatible' }
>;

type ModelConfig = CustomProviderEntry['models'][number];

type ModelModality = NonNullable<ModelConfig['modalities']>['input'][number];

type KeylessProvider = { provider: string; models?: string[] };

const PROVIDER = 'dojo';

const TRANSCRIPTION_WARNING =
  "[plugin-dojo] Transcription isn't available through Dojo's router; bring a provider key to use it.";

const SPEECH_WARNING =
  "[plugin-dojo] Speech isn't available through Dojo's router; bring a provider key to use it.";

function toKeyless(provider: string, entry: unknown): KeylessProvider | undefined {
  const envVar = providerKeyEnvVar(provider);

  if (!envVar) return undefined;

  if (process.env[envVar]) return undefined;

  if (entry === true) return { provider };

  if (typeof entry !== 'object' || entry === null || 'type' in entry) return undefined;

  const { models, ...settings } = entry as { models?: string[] } & Record<string, unknown>;

  const isSet = (value: unknown) =>
    value !== undefined && !(typeof value === 'string' && !value.trim());

  if (Object.values(settings).some(isSet)) return undefined;

  return { provider, models };
}

function modeFor({ operations, modalities }: ModelCatalogEntry): ModelConfig['mode'] {
  if (operations.includes('evaluate')) return 'evaluate';

  if (operations.includes('rerank')) return 'rerank';

  if (modalities.output.includes('embedding')) return 'embedding';

  if (modalities.output.includes('image')) return 'image_generation';

  if (modalities.output.includes('video')) return 'video_generation';

  if (modalities.output.includes('audio')) return 'audio_speech';

  if (modalities.input.includes('text') && modalities.output.includes('text')) return 'chat';

  if (modalities.input.includes('audio')) return 'audio_transcription';

  return 'chat';
}

function toModalities(list: ModelCatalogEntry['modalities']['input']): ModelModality[] {
  return list.filter((modality): modality is ModelModality => modality !== 'embedding');
}

function toModelConfig(entry: ModelCatalogEntry): ModelConfig {
  return {
    id: entry.id,
    mode: modeFor(entry),
    name: entry.name,
    limit: { context: entry.context.input, output: entry.context.output },
    ...(entry.cost && {
      cost: {
        input: entry.cost.input,
        output: entry.cost.output,
        cache_read: entry.cost.cache_read,
      },
    }),
    modalities: {
      input: toModalities(entry.modalities.input),
      output: toModalities(entry.modalities.output),
    },
    reasoning: entry.capabilities.reasoning,
    reasoningOptions: entry.capabilities.reasoningOptions,
    tool_call: entry.capabilities.toolCalling,
    structured_output: entry.capabilities.structuredOutput,
    status: entry.status,
  };
}

function catalogModels({ provider, models }: KeylessProvider): ModelCatalogEntry[] {
  const allowed =
    models && new Set(models.map((name) => canonicalizeModelId(`${provider}/${name}`)));

  return [...DEFAULT_MODEL_CATALOG.values()].filter(
    ({ id }) => id.startsWith(`${provider}/`) && (!allowed || allowed.has(canonicalizeModelId(id))),
  );
}

function onInitList(onInit: FrogBotConfig['onInit']): OnInit[] {
  if (onInit === undefined) return [];

  return Array.isArray(onInit) ? onInit : [onInit];
}

/**
 * Routes keyless built-in AI providers through Dojo's gateway as one `dojo` provider, keeping
 * their old model IDs as routers. Leaves `ai` unchanged when it is unset or when any provider
 * brings its own key.
 */
export function withDojoAI(config: FrogBotConfig, env: DojoEnv): FrogBotConfig {
  const { ai } = config;

  if (!ai) return config;

  const keyless = Object.entries(ai.providers ?? {})
    .filter(([, entry]) => entry !== undefined)
    .map(([provider, entry]) => toKeyless(provider, entry));

  if (keyless.some((entry) => entry === undefined)) return config;

  const models = (keyless as KeylessProvider[]).flatMap(catalogModels);

  if (models.length === 0) return config;

  const moved = new Map(models.map(({ id }) => [id, `${PROVIDER}/${id}`]));
  const rename = (id: string) => (moved.get(id) ?? id) as ModelId;

  const routers: Record<string, RouterConfig> = Object.fromEntries(
    [...moved].map(([id, model]) => [id, { model }]),
  );

  for (const [slug, router] of Object.entries(ai.routers ?? {})) {
    routers[slug] = { ...router, model: rename(router.model) };
  }

  const { transcriptionModel, speechModel, speechVoice, ...rest } = ai;
  const dropTranscription = transcriptionModel !== undefined && moved.has(transcriptionModel);
  const dropSpeech = speechModel !== undefined && moved.has(speechModel);
  const warnings = [
    ...(dropTranscription ? [TRANSCRIPTION_WARNING] : []),
    ...(dropSpeech ? [SPEECH_WARNING] : []),
  ];

  return {
    ...config,
    ai: {
      ...rest,
      providers: {
        [PROVIDER]: {
          type: 'openai-compatible',
          baseUrl: env.aiBaseUrl,
          apiKey: env.aiApiKey,
          models: models.map(toModelConfig),
        },
      },
      routers,
      ...(ai.defaultModel !== undefined && { defaultModel: rename(ai.defaultModel) }),
      ...(ai.smallModel !== undefined && { smallModel: rename(ai.smallModel) }),
      ...(transcriptionModel !== undefined && !dropTranscription && { transcriptionModel }),
      ...(speechModel !== undefined && !dropSpeech && { speechModel }),
      ...(speechVoice !== undefined && !dropSpeech && { speechVoice }),
    },
    ...(warnings.length > 0 && {
      onInit: [
        ...onInitList(config.onInit),
        (frogbot) => {
          for (const warning of warnings) frogbot.logger.warn(warning);
        },
      ],
    }),
  };
}

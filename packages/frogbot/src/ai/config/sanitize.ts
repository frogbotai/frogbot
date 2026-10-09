import type { ValidationMode } from '../../config/validationContext.js';
import type { FrogBotRequest } from '../../types/request.js';
import { isRecord } from '../../utilities/isRecord.js';
import { isKnownModelId } from '../catalog.js';
import {
  getConfiguredChatModelIds,
  getConfiguredModelIds,
  getConfiguredTranscriptionModelIds,
} from '../models.js';
import { isProviderName } from '../providerNames.js';
import type { AIConfig, RouterConfig, SanitizedAIConfig } from '../types.js';

export const defaultAccessFn = ({ req }: { req: FrogBotRequest }) => !!req.user;

const VERTEX_KEYS = new Set(['project', 'location', 'googleAuthOptions', 'anthropic', 'models']);

function usesFileModality(modalities: unknown): boolean {
  if (!isRecord(modalities)) return false;

  return [modalities.input, modalities.output].some(
    (list) => Array.isArray(list) && list.includes('file'),
  );
}

export type SanitizedAIBase = Omit<SanitizedAIConfig, 'usage'>;

export function sanitizeAI(ai: AIConfig, mode: ValidationMode): SanitizedAIBase {
  if (!isRecord(ai.providers)) {
    throw new Error('[frogbot] `ai.providers` is required and must be an object.');
  }

  const configured = Object.values(ai.providers).filter((entry) => entry != null);
  if (configured.length === 0) {
    throw new Error('[frogbot] At least one AI provider must be configured under `ai.providers`.');
  }

  for (const [key, entry] of Object.entries(ai.providers)) {
    if (entry === undefined) {
      continue;
    }

    if (!key.trim()) {
      throw new Error('[frogbot] AI provider names must not be empty.');
    }

    if (entry === true) {
      if (!isProviderName(key)) {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }

      continue;
    }

    if (!isRecord(entry)) {
      throw new Error(`[frogbot] Provider '${key}' must be true or an object.`);
    }

    const provider: Record<string, unknown> = entry;
    if ('type' in provider || 'baseUrl' in provider) {
      const custom = provider;
      if (custom.type !== 'openai-compatible') {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }

      if (typeof custom.baseUrl !== 'string' || !custom.baseUrl.trim()) {
        throw new Error(`[frogbot] Custom provider '${key}' requires a baseUrl.`);
      }

      if (!custom.models || !Array.isArray(custom.models) || custom.models.length === 0) {
        throw new Error(`[frogbot] Custom provider '${key}' requires a non-empty models array.`);
      }

      for (const model of custom.models) {
        if (!isRecord(model) || typeof model.id !== 'string' || !model.id.trim() || !model.mode) {
          throw new Error(
            `[frogbot] Every model for custom provider '${key}' requires an id and mode.`,
          );
        }

        if (usesFileModality(model.modalities)) {
          throw new Error(
            `[frogbot] Model '${model.id}' for custom provider '${key}' uses the type 'file'. Rename it to 'pdf'.`,
          );
        }
      }

      continue;
    }

    if (!isProviderName(key)) {
      throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
    }

    if (provider.models !== undefined) {
      if (!Array.isArray(provider.models)) {
        throw new Error(`[frogbot] Provider '${key}' models must be an array.`);
      }

      for (const model of provider.models) {
        if (typeof model !== 'string' || !isKnownModelId(`${key}/${model}`, new Set([key]))) {
          throw new Error(
            `[frogbot] Provider '${key}' models contains unknown model: ${String(model)}.`,
          );
        }
      }
    }

    if (key === 'bedrock') {
      const hasRegion = typeof provider.region === 'string' && !!provider.region.trim();
      const hasAccessKey =
        typeof provider.accessKeyId === 'string' && !!provider.accessKeyId.trim();

      const hasSecretKey =
        typeof provider.secretAccessKey === 'string' && !!provider.secretAccessKey.trim();

      const hasCredentialProvider = typeof provider.credentialProvider === 'function';
      if (!hasRegion && !hasAccessKey && !hasSecretKey && !hasCredentialProvider) {
        throw new Error(
          `[frogbot] Provider 'bedrock' requires a region or explicit AWS credentials.`,
        );
      }

      if (hasAccessKey !== hasSecretKey) {
        throw new Error(
          `[frogbot] Provider 'bedrock' requires both accessKeyId and secretAccessKey when either is set.`,
        );
      }

      if (hasCredentialProvider && (hasAccessKey || hasSecretKey)) {
        throw new Error(
          `[frogbot] Provider 'bedrock' accepts either accessKeyId and secretAccessKey or a credentialProvider, not both.`,
        );
      }

      continue;
    }

    if (key === 'vertex') {
      const unknownKey = Object.keys(provider).find((name) => !VERTEX_KEYS.has(name));
      if (unknownKey !== undefined) {
        throw new Error(`[frogbot] Provider 'vertex' does not accept '${unknownKey}'.`);
      }

      for (const name of ['project', 'location'] as const) {
        const value = provider[name];
        if (typeof value !== 'string' || !value.trim()) {
          throw new Error(`[frogbot] Provider 'vertex' requires a non-empty ${name}.`);
        }
      }

      if (provider.anthropic !== undefined) {
        const location = isRecord(provider.anthropic) ? provider.anthropic.location : undefined;
        if (typeof location !== 'string' || !location.trim()) {
          throw new Error(`[frogbot] Provider 'vertex' requires a non-empty anthropic.location.`);
        }
      }

      continue;
    }

    if (typeof provider.apiKey !== 'string' || !provider.apiKey.trim()) {
      throw new Error(
        `[frogbot] Provider '${key}' requires a non-empty apiKey when configured with an object.`,
      );
    }
  }

  if (ai.routers !== undefined && !isRecord(ai.routers)) {
    throw new Error('[frogbot] `ai.routers` must be an object.');
  }

  const routers: Record<string, RouterConfig> = ai.routers ?? {};

  for (const [slug, router] of Object.entries(routers)) {
    if (!isRecord(router) || typeof router.model !== 'string' || !router.model.trim()) {
      throw new Error(`[frogbot] Router '${slug}' requires a model.`);
    }
  }

  const providers = new Set(
    Object.entries(ai.providers)
      .filter(([, entry]) => entry != null)
      .map(([name]) => name),
  );

  if (ai.defaultModel !== undefined) {
    const model = routers[ai.defaultModel]?.model ?? ai.defaultModel;
    const separator = model.indexOf('/');
    const provider = separator > 0 ? model.slice(0, separator) : '';

    if (!provider || !providers.has(provider)) {
      throw new Error(
        `[frogbot] defaultModel '${ai.defaultModel}' does not resolve to a configured provider or router.`,
      );
    }
  }

  const configuredModelIds = new Set(getConfiguredModelIds(ai));
  const modelChecks = [
    ['smallModel', new Set(getConfiguredChatModelIds(ai)), 'a chat model'],
    [
      'transcriptionModel',
      new Set(getConfiguredTranscriptionModelIds(ai)),
      'a transcription model',
    ],
  ] as const;

  for (const [key, modeModelIds, kind] of modelChecks) {
    const model = ai[key];

    if (model === undefined) continue;

    const target = routers[model]?.model;
    const message =
      !configuredModelIds.has(model) || (target !== undefined && !configuredModelIds.has(target))
        ? `[frogbot] ai.${key} '${model}' is not configured.`
        : !modeModelIds.has(model)
          ? `[frogbot] ai.${key} '${model}' is not ${kind}.`
          : undefined;

    if (!message) continue;

    if (mode === 'runtime') throw new Error(message);

    // eslint-disable-next-line no-console -- build-time config warnings go to the terminal
    console.warn(message);
  }

  const hooks = {
    beforeOperation: ai.hooks?.beforeOperation ?? [],
    beforeUpstream: ai.hooks?.beforeUpstream ?? [],
    afterUpstream: ai.hooks?.afterUpstream ?? [],
    afterError: ai.hooks?.afterError ?? [],
    afterOperation: ai.hooks?.afterOperation ?? [],
  };

  const access = {
    generate: ai.access?.generate ?? defaultAccessFn,
    embed: ai.access?.embed ?? defaultAccessFn,
    transcribe: ai.access?.transcribe ?? defaultAccessFn,
    rerank: ai.access?.rerank ?? defaultAccessFn,
    evaluate: ai.access?.evaluate ?? defaultAccessFn,
  };

  const _internal = {
    deploymentId: ai.deploymentId ?? process.env.FROGBOT_DEPLOYMENT_ID ?? 'local',
  };

  const telemetry = {
    enabled: ai.telemetry?.enabled !== false,
    enrichSpan: ai.telemetry?.enrichSpan,
  };

  return {
    providers: ai.providers,
    routers,
    defaultModel: ai.defaultModel,
    smallModel: ai.smallModel,
    transcriptionModel: ai.transcriptionModel,
    hooks,
    access,
    telemetry,
    _internal,
  };
}

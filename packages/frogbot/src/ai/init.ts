import type { Gateway, GatewayConfig } from '@frogbotai/gateway';
import { createGateway } from '@frogbotai/gateway';

import type { Logger } from '../frogbot.js';
import { builtInKeyError, envCredential, linkedCredential } from './credentials.js';
import { toGatewayHooks } from './hooks.js';
import { logUsage } from './logUsage.js';
import { isProviderName } from './providerNames.js';
import type {
  BedrockProviderEntry,
  BuiltInProviderEntry,
  CustomProviderEntry,
  SanitizedAIConfig,
  VertexProviderEntry,
} from './types.js';

function isCustomProvider(entry: object): entry is CustomProviderEntry {
  return 'type' in entry && entry.type === 'openai-compatible';
}

function isBedrockProvider(entry: object): entry is BedrockProviderEntry {
  return 'region' in entry || 'accessKeyId' in entry || 'credentialProvider' in entry;
}

function isVertexProvider(entry: object): entry is VertexProviderEntry {
  return 'project' in entry && 'location' in entry;
}

function setGatewayProvider<K extends keyof GatewayConfig['providers']>(
  providers: GatewayConfig['providers'],
  provider: K,
  entry: GatewayConfig['providers'][K],
): void {
  providers[provider] = entry;
}

export function buildGatewayConfig(config: SanitizedAIConfig): GatewayConfig {
  const providers = {} as GatewayConfig['providers'];

  for (const [key, entry] of Object.entries(config.providers)) {
    if (entry === undefined) continue;

    const piece = config.linkedProviders?.[key];

    if (piece && isProviderName(key)) {
      const { apiKey, models } = entry === true ? {} : (entry as Partial<BuiltInProviderEntry>);

      setGatewayProvider(providers, key, {
        ...(apiKey !== undefined && { apiKey }),
        ...(models !== undefined && { models }),
        credential: linkedCredential({ provider: key, piece, apiKey }),
      });

      continue;
    }

    if (entry === true) {
      if (!isProviderName(key)) {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }

      const credential = envCredential(key);

      setGatewayProvider(providers, key, credential ? { credential } : {});
      continue;
    }

    if (isCustomProvider(entry)) {
      if (isProviderName(key)) {
        throw new Error(
          `[frogbot] Custom provider '${key}' conflicts with a built-in provider name.`,
        );
      }

      providers[key] = {
        baseURL: entry.baseUrl,
        ...(entry.apiKey !== undefined && { apiKey: entry.apiKey }),
        ...(entry.headers !== undefined && { headers: entry.headers }),
      };

      continue;
    }

    if (!isProviderName(key)) {
      throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
    }

    if (key === 'bedrock') {
      if (!isBedrockProvider(entry)) {
        throw new Error(
          "[frogbot] Provider 'bedrock' requires a region or explicit AWS credentials.",
        );
      }

      providers.bedrock = entry;
      continue;
    }

    if (key === 'vertex') {
      if (!isVertexProvider(entry)) {
        throw new Error("[frogbot] Provider 'vertex' requires a project and a location.");
      }

      providers.vertex = entry;
      continue;
    }

    const { apiKey, models } = entry as BuiltInProviderEntry;
    const keyError = builtInKeyError(key, apiKey);

    if (keyError) throw new Error(keyError);

    const credential = apiKey === undefined ? envCredential(key) : undefined;

    if (key === 'replicate') {
      providers.replicate = {
        ...(apiKey !== undefined && { apiToken: apiKey }),
        ...(models !== undefined && { models }),
        ...(credential && { credential }),
      };

      continue;
    }

    setGatewayProvider(providers, key, {
      ...(apiKey !== undefined && { apiKey }),
      ...(models !== undefined && { models }),
      ...(credential && { credential }),
    });
  }

  const hooks = toGatewayHooks(config.hooks);

  return {
    providers,
    hooks: {
      ...hooks,
      afterOperation: [logUsage, ...(hooks.afterOperation ?? [])],
    },
  };
}

export function createAIGateway(config: SanitizedAIConfig, logger?: Logger): Gateway {
  const create = createGateway as (config: GatewayConfig) => Gateway;

  return create({
    ...buildGatewayConfig(config),
    ...(logger && { logger }),
  });
}

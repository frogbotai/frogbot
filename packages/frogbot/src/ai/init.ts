// Embedded gateway construction — maps FrogBot's AI provider config onto
// `@frogbotai/gateway` and creates the in-process gateway instance at boot.
//
// FrogBot's provider keys mostly match the gateway's provider table; the
// two renames (`bedrock` → `amazon-bedrock`, `together` → `togetherai`) and
// replicate's `apiKey` → `apiToken` are normalized here. Custom
// `openai-compatible` entries become gateway providers under their configured
// key.

import { createGateway } from '@frogbotai/gateway';
import type { Gateway, GatewayConfig } from '@frogbotai/gateway';

import type { Logger } from '../frogbot.js';
import type {
  CustomProviderEntry,
  SanitizedAIConfig,
} from '../types/ai.js';
import { toGatewayHooks } from './hooks.js';
import { getGatewayProviderName, isProviderName } from './providerNames.js';

function isCustomProvider(entry: object): entry is CustomProviderEntry {
  return 'type' in entry && entry.type === 'openai-compatible';
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

    if (entry === true) {
      if (!isProviderName(key)) {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }
      setGatewayProvider(providers, getGatewayProviderName(key), {});
      continue;
    }

    if (!isProviderName(key)) {
      if (!isCustomProvider(entry)) {
        throw new Error(`[frogbot] Custom provider '${key}' must have type: 'openai-compatible'.`);
      }
      providers[key] = {
        baseURL: entry.baseUrl,
        ...(entry.apiKey !== undefined && { apiKey: entry.apiKey }),
        ...(entry.headers !== undefined && { headers: entry.headers }),
      };
      continue;
    }

    if (key === 'replicate') {
      if (!('apiKey' in entry) || typeof entry.apiKey !== 'string' || !entry.apiKey.trim()) {
        throw new Error(
          "[frogbot] Provider 'replicate' requires a non-empty apiKey when configured with an object.",
        );
      }
      providers.replicate = { apiToken: entry.apiKey };
      continue;
    }

    if (key === 'bedrock') {
      providers['amazon-bedrock'] = entry;
      continue;
    }

    if (!('apiKey' in entry) || typeof entry.apiKey !== 'string' || !entry.apiKey.trim()) {
      throw new Error(
        `[frogbot] Provider '${key}' requires a non-empty apiKey when configured with an object.`,
      );
    }
    setGatewayProvider(providers, getGatewayProviderName(key), { apiKey: entry.apiKey });
  }

  return {
    providers,
    hooks: toGatewayHooks(config.hooks),
  };
}

/**
 * Adapts FrogBot's `Logger` (pino-style `(msg, ...args)`) to the gateway's
 * `GatewayLogger` contract (pino-style `(obj, msg?)` overloads).
 */
function toGatewayLogger(logger: Logger): NonNullable<GatewayConfig['logger']> {
  const adapt =
    (log: (msg: string, ...args: unknown[]) => void) =>
    (objOrMsg: Record<string, unknown> | string, msg?: string): void => {
      if (typeof objOrMsg === 'string') {
        log(objOrMsg);
      } else {
        log(msg ?? '', objOrMsg);
      }
    };

  return {
    trace: adapt((msg, ...args) => logger.trace(msg, ...args)),
    debug: adapt((msg, ...args) => logger.debug(msg, ...args)),
    info: adapt((msg, ...args) => logger.info(msg, ...args)),
    warn: adapt((msg, ...args) => logger.warn(msg, ...args)),
    error: adapt((msg, ...args) => logger.error(msg, ...args)),
    fatal: adapt((msg, ...args) => logger.fatal(msg, ...args)),
  };
}

export function createAIGateway(config: SanitizedAIConfig, logger?: Logger): Gateway {
  const create = createGateway as (config: GatewayConfig) => Gateway;
  return create({
    ...buildGatewayConfig(config),
    ...(logger && { logger: toGatewayLogger(logger) }),
  });
}

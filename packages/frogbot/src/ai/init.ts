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
  BedrockProviderEntry,
  BuiltInProviderEntry,
  CustomProviderEntry,
  SanitizedAIConfig,
} from '../types/ai.js';
import { toGatewayHooks } from './hooks.js';

/** FrogBot provider key → gateway provider name, where they differ. */
const PROVIDER_NAME_MAP: Record<string, string> = {
  bedrock: 'amazon-bedrock',
  together: 'togetherai',
};

function isCustomProvider(
  entry: BuiltInProviderEntry | BedrockProviderEntry | CustomProviderEntry,
): entry is CustomProviderEntry {
  return (entry as CustomProviderEntry).type === 'openai-compatible';
}

export function buildGatewayConfig(config: SanitizedAIConfig): GatewayConfig {
  const providers = {} as GatewayConfig['providers'];

  for (const [key, entry] of Object.entries(config.providers)) {
    if (!entry) continue;

    if (isCustomProvider(entry)) {
      providers[key] = {
        baseURL: entry.baseUrl,
        ...(entry.apiKey !== undefined && { apiKey: entry.apiKey }),
        ...(entry.headers !== undefined && { headers: entry.headers }),
      };
      continue;
    }

    if (key === 'replicate') {
      const apiKey = 'apiKey' in entry ? entry.apiKey : undefined;
      providers.replicate = apiKey === undefined ? {} : { apiToken: apiKey };
      continue;
    }

    Object.assign(providers, { [PROVIDER_NAME_MAP[key] ?? key]: entry });
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

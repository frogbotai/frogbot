import type { SanitizedConfig } from 'payload';

import type { FrogBotSanitizedConfig } from './sanitized.js';

/** @internal — consumed by `@frogbotai/next`; not intended for user code. */
export function getPayloadConfig(
  config: FrogBotSanitizedConfig | Promise<FrogBotSanitizedConfig>,
): Promise<SanitizedConfig> {
  return Promise.resolve(config).then((resolved) => resolved._internal.payloadConfig);
}

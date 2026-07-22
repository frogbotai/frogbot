import type { SanitizedConfig } from 'payload';

import type { FrogbotSanitizedConfig } from '../types/sanitized.js';

/** @internal — consumed by `@frogbotai/next`; not intended for user code. */
export function getPayloadConfig(
  config: FrogbotSanitizedConfig | Promise<FrogbotSanitizedConfig>,
): Promise<SanitizedConfig> {
  return Promise.resolve(config).then((resolved) => resolved._internal.payloadConfig);
}

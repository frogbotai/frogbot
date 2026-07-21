import { describe, expect, it } from 'vitest';

import { getPayloadConfig } from './getPayloadConfig.js';
import type { FrogbotSanitizedConfig } from '../types/sanitized.js';

function makeConfig() {
  const payloadConfig = { collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogbotSanitizedConfig;
  return { config, payloadConfig };
}

describe('getPayloadConfig', () => {
  it('resolves the internal payload config from a plain config', async () => {
    const { config, payloadConfig } = makeConfig();
    await expect(getPayloadConfig(config)).resolves.toBe(payloadConfig);
  });

  it('resolves the internal payload config from a config promise', async () => {
    const { config, payloadConfig } = makeConfig();
    await expect(getPayloadConfig(Promise.resolve(config))).resolves.toBe(payloadConfig);
  });
});

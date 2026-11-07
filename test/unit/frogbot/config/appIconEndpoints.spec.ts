import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { getPayloadConfig } from '../../../../packages/frogbot/src/exports/internal.js';

async function buildPayloadConfig() {
  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number', init: () => ({}) } as unknown as FrogBotConfig['db'],
    typescript: { autoGenerate: false },
    collections: [{ slug: 'users', auth: true, fields: [] }],
  });

  return getPayloadConfig(config);
}

describe('app icon endpoints in the built config', () => {
  it('puts each endpoint once in every independently built config copy', async () => {
    const copies = await Promise.all([buildPayloadConfig(), buildPayloadConfig()]);

    for (const payloadConfig of copies) {
      const routes = payloadConfig.endpoints.map(({ method, path }) => `${method} ${path}`);

      expect(routes.filter((route) => route === 'get /frogbot/app-icon/:size')).toHaveLength(1);
      expect(routes.filter((route) => route === 'get /frogbot/app-manifest')).toHaveLength(1);
    }
  });
});

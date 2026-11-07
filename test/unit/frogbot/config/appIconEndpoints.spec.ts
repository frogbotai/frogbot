import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { getPayloadConfig } from '../../../../packages/frogbot/src/exports/internal.js';

async function buildPayloadConfig() {
  const config = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number', init: () => ({}) } as unknown as FrogBotConfig['db'],
    typescript: { autoGenerate: false },
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }],
  });

  return getPayloadConfig(config);
}

describe('app icon and manifest endpoints', () => {
  it('are in every built config copy exactly once, with no route handler involved', async () => {
    const copies = [await buildPayloadConfig(), await buildPayloadConfig()];

    expect(copies[0]).not.toBe(copies[1]);

    for (const copy of copies) {
      const routes = copy.endpoints.map(({ method, path }) => `${method} ${path}`);

      expect(routes.filter((route) => route === 'get /frogbot/app-icon/:size')).toHaveLength(1);
      expect(routes.filter((route) => route === 'get /frogbot/app-manifest')).toHaveLength(1);
    }
  });
});

import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import { mongooseAdapter } from '../../../packages/db-mongodb/src/index.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

const require = createRequire(
  new URL('../../../packages/db-mongodb/package.json', import.meta.url),
);

const upstreamRequire = createRequire(require.resolve('@payloadcms/db-mongodb'));

const { buildConfig, BasePayload } = await import(upstreamRequire.resolve('payload'));

describe('mongooseAdapter with url: false', () => {
  it('starts without waiting on a connection that never opens', async () => {
    const payload = new BasePayload();

    await payload.init({
      config: await buildConfig({
        secret: 'no-connection',
        db: mongooseAdapter({ url: false }),
        admin: { disable: true },
        collections: [
          { slug: 'seeds', versions: true, fields: [{ name: 'keyword', type: 'text' }] },
        ],
        typescript: { autoGenerate: false },
        jobs: { tasks: [{ slug: 'noop', handler: () => ({ output: {} }) }] },
      }),
    });

    expect(payload.db.url).toBe(false);
  }, 15_000);
});

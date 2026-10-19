import type { PayloadRequest } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import { dojo } from '../../../packages/plugins/plugin-dojo/src/index.js';

const ENV = {
  DOJO: '1',
  DOJO_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  DOJO_R2_BUCKET: 'app-bucket',
  DOJO_R2_ACCESS_KEY_ID: 'r2-key',
  DOJO_R2_SECRET_ACCESS_KEY: 'r2-secret',
  DOJO_AI_API_KEY: 'fb_router-key',
  DOJO_AI_BASE_URL: 'https://dojo.example/api/v1',
  DOJO_JOBS_SECRET: 'jobs-secret',
};

type Endpoint = {
  path: string;
  method: string;
  handler: (req: PayloadRequest) => Promise<Response>;
};

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dojo() jobs endpoint', () => {
  it('runs jobs for the jobs secret and refuses anyone else', async () => {
    const sanitized = await buildConfig({
      secret: 'test-secret',
      db: {} as FrogBotConfig['db'],
      collections: [{ slug: 'users', auth: true, fields: [] }],
      plugins: [dojo()],
    });

    const payloadConfig = await sanitized._internal.payloadConfig;
    const endpoint = (
      payloadConfig.collections.find(({ slug }) => slug === 'payload-jobs')?.endpoints as
        Endpoint[] | undefined
    )?.find(({ path, method }) => path === '/run' && method === 'get');

    const call = (authorization?: string) =>
      endpoint!.handler({
        headers: new Headers(authorization ? { authorization } : {}),
        user: null,
        query: { disableScheduling: 'true' },
        i18n: { t: (key: string) => key },
        payload: {
          config: payloadConfig,
          collections: {},
          logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
          db: {
            beginTransaction: () => Promise.resolve(null),
            updateJobs: () => Promise.resolve([]),
          },
        },
      } as unknown as PayloadRequest);

    expect((await call('Bearer jobs-secret')).status).toBe(200);
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
  });
});

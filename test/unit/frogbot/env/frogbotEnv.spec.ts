import { afterEach, describe, expect, it } from 'vitest';

import { env } from '../../../../packages/frogbot/src/env/builders.js';
import { defineEnv } from '../../../../packages/frogbot/src/env/defineEnv.js';
import { frogbotEnv } from '../../../../packages/frogbot/src/env/frogbotEnv.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('frogbotEnv', () => {
  it('uses fail-safe defaults when NODE_ENV is unset', () => {
    process.env = { DATABASE_URL: 'sqlite.db', FROGBOT_SECRET: 'secret' };

    expect(defineEnv(frogbotEnv)).toEqual({
      databaseUrl: 'sqlite.db',
      frogbotSecret: 'secret',
      logLevel: 'info',
      nodeEnv: 'production',
      port: 3000,
    });
  });

  it('allows base builders to be overridden by a spread', () => {
    process.env = { DATABASE_URL: 'sqlite.db', FROGBOT_SECRET: 'secret' };

    expect(
      defineEnv({
        ...frogbotEnv,
        port: env.number().default(4000),
      }).port,
    ).toBe(4000);
  });
});

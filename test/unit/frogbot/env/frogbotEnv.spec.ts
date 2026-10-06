import { afterEach, describe, expect, it } from 'vitest';

import { env } from '../../../../packages/frogbot/src/env/builders.js';
import { defineEnv } from '../../../../packages/frogbot/src/env/defineEnv.js';
import { frogbotEnv } from '../../../../packages/frogbot/src/env/frogbotEnv.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function replaceEnv(values: Record<string, string>) {
  for (const key of Object.keys(process.env)) delete process.env[key];

  Object.assign(process.env, values);
}

describe('frogbotEnv', () => {
  it('uses fail-safe defaults when NODE_ENV is unset', () => {
    replaceEnv({ DATABASE_URL: 'sqlite.db', FROGBOT_SECRET: 'secret' });

    expect(defineEnv(frogbotEnv)).toEqual({
      databaseUrl: 'sqlite.db',
      frogbotSecret: 'secret',
      logLevel: 'info',
      nodeEnv: 'production',
      port: 3000,
    });
  });

  it('allows base builders to be overridden by a spread', () => {
    replaceEnv({ DATABASE_URL: 'sqlite.db', FROGBOT_SECRET: 'secret' });

    expect(
      defineEnv({
        ...frogbotEnv,
        port: env.number().default(4000),
      }).port,
    ).toBe(4000);
  });
});

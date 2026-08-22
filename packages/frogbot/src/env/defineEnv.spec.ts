import { afterEach, describe, expect, it } from 'vitest';

import { env } from './builders.js';
import { defineEnv } from './defineEnv.js';
import { FrogbotEnvError } from './error.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('defineEnv', () => {
  it('aggregates parsing and requiredness issues in schema order', () => {
    process.env = { NODE_ENV: 'production', PORT: 'abc' };

    expect(() =>
      defineEnv({
        port: env.number(),
        frogbotSecret: env.string().required(),
        databaseUrl: env.string().required(),
      }),
    ).toThrowError(
      new FrogbotEnvError([
        { envName: 'PORT', message: 'must be a number', name: 'port' },
        { envName: 'FROGBOT_SECRET', message: 'is required', name: 'frogbotSecret' },
        { envName: 'DATABASE_URL', message: 'is required', name: 'databaseUrl' },
      ]),
    );
  });

  it('exposes structured issues', () => {
    process.env = { NODE_ENV: 'production' };

    try {
      defineEnv({ secret: env.string().required() });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FrogbotEnvError);
      expect((error as FrogbotEnvError).issues).toEqual([
        { envName: 'SECRET', message: 'is required', name: 'secret' },
      ]);
    }
  });

  it('skips requiredness in test mode while still parsing present values', () => {
    process.env = { NODE_ENV: 'test', PORT: 'invalid' };

    expect(() => defineEnv({ port: env.number(), secret: env.string().required() })).toThrow(
      'port (PORT): must be a number',
    );

    delete process.env.PORT;
    expect(defineEnv({ secret: env.string().required() })).toEqual({ secret: undefined });
  });

  it('treats empty strings as unset', () => {
    process.env = { NODE_ENV: 'production', PORT: '' };

    expect(defineEnv({ port: env.number().default(3000) })).toEqual({ port: 3000 });
  });

  it('evaluates required predicates against pass-one values', () => {
    process.env = { EMAIL_ENABLED: 'true', NODE_ENV: 'production' };

    expect(() =>
      defineEnv({
        emailEnabled: env.boolean().default(false),
        smtpUrl: env.string().requiredWhen((values) => values.emailEnabled === true),
      }),
    ).toThrow('smtpUrl (SMTP_URL): is required');
  });

  it('does not require a conditional variable when its predicate is false', () => {
    process.env = { NODE_ENV: 'production' };

    expect(
      defineEnv({
        emailEnabled: env.boolean().default(false),
        smtpUrl: env.string().requiredWhen((values) => values.emailEnabled === true),
      }),
    ).toEqual({ emailEnabled: false, smtpUrl: undefined });
  });

  it('turns predicate failures into configuration errors', () => {
    process.env = { NODE_ENV: 'production' };

    expect(() =>
      defineEnv({
        smtpUrl: env.string().requiredWhen(() => {
          throw new Error('bad predicate');
        }),
      }),
    ).toThrow('Required predicate for smtpUrl failed: bad predicate');
  });

  it('rejects duplicate env variable names', () => {
    expect(() =>
      defineEnv({ first: env.string().name('SHARED'), second: env.string().name('SHARED') }),
    ).toThrow('Duplicate env variable name: SHARED');
  });

  it('returns a frozen object', () => {
    process.env = { VALUE: 'current' };

    expect(Object.isFrozen(defineEnv({ value: env.string() }))).toBe(true);
  });

  it('takes a new environment snapshot on every call', () => {
    process.env = { VALUE: 'first' };
    expect(defineEnv({ value: env.string() }).value).toBe('first');

    process.env.VALUE = 'second';
    expect(defineEnv({ value: env.string() }).value).toBe('second');
  });

  it('uses overridden variable names', () => {
    process.env = { CUSTOM_VALUE: 'set' };

    expect(defineEnv({ value: env.string().name('CUSTOM_VALUE') })).toEqual({ value: 'set' });
  });
});

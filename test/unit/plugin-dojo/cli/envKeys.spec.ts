import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  databaseKey,
  mask,
  remoteDatabaseURL,
} from '../../../../packages/plugins/plugin-dojo/src/cli/envKeys.js';
import { tempDir, writeFiles } from './helpers.js';

const execFileAsync = promisify(execFile);

const envKeysURL = pathToFileURL(
  new URL('../../../../packages/plugins/plugin-dojo/src/cli/envKeys.ts', import.meta.url).pathname,
).href;

const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

async function keysInFreshProcess(root: string, env: NodeJS.ProcessEnv): Promise<unknown> {
  const script = `const { envKeys, readEnvFiles, mask } = await import(${JSON.stringify(envKeysURL)}); process.stdout.write(JSON.stringify(envKeys(readEnvFiles(${JSON.stringify(root)})).map((key) => ({ ...key, masked: mask(key.value) }))));`;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', tsxLoader, '--input-type=module', '--eval', script],
    { env },
  );

  return JSON.parse(stdout);
}

describe('envKeys', () => {
  it("carries the .env files' keys, first file wins, never Dojo's, the Dojo sign-in or the shell's", async () => {
    const root = await tempDir();

    await writeFiles(root, {
      '.env.development.local': 'STRIPE_KEY=sk_test_aaaaaa4242\nEMPTY_KEY=\n',
      '.env': [
        'STRIPE_KEY=sk_test_from_env',
        'DATABASE_URL=file:./data/my.db',
        'FROGBOT_SECRET=s3cret',
        'NODE_ENV=production',
        'PORT=4000',
        'HOSTNAME=0.0.0.0',
        'FROGBOT_DOJO_TOKEN=fb_ci_secret_token',
        'FROGBOT_DOJO_URL=https://dojo.example',
        'EMPTY_KEY=',
      ].join('\n'),
    });

    await expect(
      keysInFreshProcess(root, {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        FOO: 'shell-only',
      }),
    ).resolves.toEqual([{ name: 'STRIPE_KEY', value: 'sk_test_aaaaaa4242', masked: '••••4242' }]);
  });
});

describe('mask', () => {
  it('shows the last 4 characters from 12 characters up', () => {
    expect(mask('sk_test_4242')).toBe('••••4242');
    expect(mask('sk_tes_4242')).toBe('••••');
    expect(mask('abcdefgh')).toBe('••••');
  });
});

describe('remoteDatabaseURL', () => {
  it.each([
    'postgres://crm:pw@db.example.com:5432/crm',
    'postgresql://crm:pw@db.example.com/crm?sslmode=require',
    'postgres://crm:pw@10.0.0.5/crm',
    'postgres://crm:pw@[2001:db8::1]:5432/crm',
    'postgres://crm:pw@LOCALHOST.example.com/crm',
  ])('is true for %s', (url) => {
    expect(remoteDatabaseURL(url)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'file:./frogbot.db',
    'file:/data/frogbot.db',
    'postgres://u:p@0.0.0.0:5432/db',
    'postgres://u:p@127.0.0.2:5432/db',
    'postgres://u:p@[::ffff:127.0.0.1]:5432/db',
    'postgres://u:p@localhost.:5432/db',
    'postgres://postgres:postgres@localhost:5432/crm',
    'postgres://postgres:postgres@LocalHost/crm',
    'postgres://postgres:postgres@127.0.0.1:5432/crm',
    'postgres://postgres:postgres@[::1]:5432/crm',
    'postgres:///crm?host=/var/run/postgresql',
    'mysql://root:pw@db.example.com/crm',
    'libsql://crm.turso.io',
    'not a url',
  ])('is false for %s', (url) => {
    expect(remoteDatabaseURL(url)).toBe(false);
  });
});

describe('databaseKey', () => {
  const env = { DATABASE_URL: 'postgres://crm:pw@db.example.com/crm' };

  it("is the remote DATABASE_URL of a Postgres app, and none for another adapter's or a local one", () => {
    expect(databaseKey(env, { name: 'postgres' })).toEqual([
      { name: 'DATABASE_URL', value: env.DATABASE_URL },
    ]);
    expect(databaseKey(env, { name: 'sqlite' })).toEqual([]);
    expect(databaseKey(env, {})).toEqual([]);
    expect(
      databaseKey({ DATABASE_URL: 'postgres://p:p@127.0.0.1/crm' }, { name: 'postgres' }),
    ).toEqual([]);
    expect(databaseKey({}, { name: 'postgres' })).toEqual([]);
  });
});

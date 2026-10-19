import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { mask } from '../../../../../packages/frogbot/src/bin/share/envKeys.js';
import { tempDir, writeFiles } from './helpers.js';

const execFileAsync = promisify(execFile);

const envKeysURL = pathToFileURL(
  new URL('../../../../../packages/frogbot/src/bin/share/envKeys.ts', import.meta.url).pathname,
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
  it("carries the .env files' keys, first file wins, never Dojo's or the shell's", async () => {
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

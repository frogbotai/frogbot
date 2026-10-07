import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

const execFileAsync = promisify(execFile);
const loadEnvURL = pathToFileURL(
  new URL('../../../../packages/frogbot/src/bin/loadEnv.ts', import.meta.url).pathname,
).href;

const tsxLoader = createRequire(import.meta.url).resolve('tsx/esm');

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'frogbot-env-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return dir;
}

async function loadEnvInFreshProcess(dir: string, env: NodeJS.ProcessEnv): Promise<string> {
  const script = `const { loadEnv } = await import(${JSON.stringify(loadEnvURL)}); loadEnv(); process.stdout.write(process.env.FROGBOT_TEST_KEY ?? '');`;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', tsxLoader, '--input-type=module', '--eval', script],
    { cwd: dir, env },
  );

  return stdout;
}

describe('loadEnv', () => {
  it('does not overwrite an existing environment variable', async () => {
    const dir = await tempDir();

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=from-file\n');
    vi.stubEnv('FROGBOT_TEST_KEY', 'from-process');

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const { loadEnv } = await import('../../../../packages/frogbot/src/bin/loadEnv.js');
    loadEnv(dir);

    expect(process.env.FROGBOT_TEST_KEY).toBe('from-process');
  });

  it('does not fail when env files are omitted', async () => {
    const dir = await tempDir();

    await expect(
      loadEnvInFreshProcess(dir, {
        ...process.env,
        FROGBOT_TEST_KEY: undefined,
        __NEXT_PROCESSED_ENV: undefined,
      }),
    ).resolves.toBe('');
  });

  it('uses production env file precedence', async () => {
    const dir = await tempDir();

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=base\n');
    await writeFile(join(dir, '.env.local'), 'FROGBOT_TEST_KEY=local\n');
    await writeFile(join(dir, '.env.production'), 'FROGBOT_TEST_KEY=production\n');
    await writeFile(join(dir, '.env.production.local'), 'FROGBOT_TEST_KEY=production-local\n');

    await expect(
      loadEnvInFreshProcess(dir, {
        ...process.env,
        FROGBOT_TEST_KEY: undefined,
        NODE_ENV: 'production',
        __NEXT_PROCESSED_ENV: undefined,
      }),
    ).resolves.toBe('production-local');
  });

  it('preserves existing variables over every env file layer', async () => {
    const dir = await tempDir();

    await writeFile(join(dir, '.env'), 'FROGBOT_TEST_KEY=base\n');
    await writeFile(join(dir, '.env.local'), 'FROGBOT_TEST_KEY=local\n');
    await writeFile(join(dir, '.env.production'), 'FROGBOT_TEST_KEY=production\n');
    await writeFile(join(dir, '.env.production.local'), 'FROGBOT_TEST_KEY=production-local\n');

    await expect(
      loadEnvInFreshProcess(dir, {
        ...process.env,
        FROGBOT_TEST_KEY: 'from-process',
        NODE_ENV: 'production',
        __NEXT_PROCESSED_ENV: undefined,
      }),
    ).resolves.toBe('from-process');
  });
});

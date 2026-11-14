import { describe, expect, it } from 'vitest';

import { deploy } from '../../../../packages/frogbot/src/bin/deploy/command.js';
import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import { dojoTarget } from '../../../../packages/plugins/plugin-dojo/src/deploy.js';
import { dojo } from '../../../../packages/plugins/plugin-dojo/src/index.js';
import { deployDojo } from './deployDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

const appConfig = {
  cli: { commands: {}, deployTargets: { dojo: dojoTarget } },
  _internal: { payloadConfig: Promise.resolve({ collections: [], db: {} }) },
} as unknown as FrogBotSanitizedConfig;

async function deployWith(args: string[], target: string[]) {
  const root = await tempDir();
  const fake = await startFakeDojo();
  const io = testIO({
    cwd: root,
    env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
  });

  await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

  const code = await deploy([...target, ...args], { config: appConfig, io: io.io });

  return {
    code,
    paths: fake.paths(),
    stdout: io.stdout().map((line) => line.replaceAll(fake.url, '<dojo>')),
  };
}

describe('deploy dojo', () => {
  it('is added by dojo() under cli.deployTargets', () => {
    const config = dojo()({ collections: [], secret: 'x' } as never) as {
      cli: { deployTargets: object };
    };

    expect(config.cli.deployTargets).toEqual({ dojo: dojoTarget });
  });

  it('is what frogbot deploy runs with no target: same requests, same output', async () => {
    const named = await deployWith(['--no-data', '--wait'], ['dojo']);
    const unnamed = await deployWith(['--no-data', '--wait'], []);

    expect(named.code).toBe(0);
    expect(unnamed).toEqual(named);
    expect(named.paths).toContain('POST /api/apps/1/deployments');
  });

  it('writes only the JSON result on stdout under --json, the progress on stderr', async () => {
    const root = await tempDir();
    const fake = await startFakeDojo();
    const io = testIO({
      cwd: root,
      env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
    });

    await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

    expect(await deployDojo(['--json', '--no-data', '--wait'], io.io)).toBe(0);
    expect(io.stdout()).toHaveLength(1);
    expect(JSON.parse(io.stdout()[0] ?? '')).toMatchObject({ target: 'dojo', ok: true });
    expect(io.stderr().some((line) => line.startsWith('[build] '))).toBe(true);
  });

  it('exits 3 with the sign-in link in the JSON result when nobody can sign in', async () => {
    const root = await tempDir();
    const fake = await startFakeDojo();
    const io = testIO({
      cwd: root,
      env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
    });

    await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

    const code = await deployDojo(['--json', '--no-data'], io.io);
    const paths = fake.paths();
    const stdout = io.stdout().map((line) => line.replaceAll(fake.url, '<dojo>'));
    const link = '<dojo>/device?user_code=BCDF-GHJK';

    expect(code).toBe(3);
    expect(JSON.parse(stdout.join('\n'))).toMatchObject({
      target: 'dojo',
      ok: false,
      error: expect.stringContaining(link),
      needs: 'sign-in',
      link,
      userCode: 'BCDF-GHJK',
    });
    expect(paths).toEqual(['POST /api/cli/device/code']);
  });

  it('dry-runs: lists files, size and keys and makes no request', async () => {
    const root = await tempDir();
    const fake = await startFakeDojo();
    const io = testIO({
      cwd: root,
      env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
    });

    await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

    expect(await deployDojo(['--dry-run'], io.io)).toBe(0);
    expect(fake.requests).toEqual([]);
    expect(io.stdout()).toEqual([
      '[dry-run] Create a new app on Dojo',
      expect.stringMatching(/^\[dry-run\] Upload \d+ files \(.+\)$/),
      '[dry-run] Keys: OPENAI_API_KEY',
      '[dry-run] Data: none',
      '[frogbot] Dry run of deploy dojo: nothing was changed.',
    ]);
  });

  it('carries every key without asking under --no-interactive, even with a terminal', async () => {
    const root = await tempDir();
    const fake = await startFakeDojo();
    const io = testIO({
      cwd: root,
      isTTY: true,
      env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
    });

    await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

    expect(await deployDojo(['--no-interactive', '--no-data', '--wait'], io.io)).toBe(0);
    expect(io.asked).toEqual([]);
  });
});

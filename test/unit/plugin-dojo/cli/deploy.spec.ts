import { describe, expect, it } from 'vitest';

import { deploy } from '../../../../packages/frogbot/src/bin/deploy/command.js';
import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import { runShare } from '../../../../packages/plugins/plugin-dojo/src/cli/run.js';
import { dojoTarget } from '../../../../packages/plugins/plugin-dojo/src/deploy.js';
import { dojo } from '../../../../packages/plugins/plugin-dojo/src/index.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

const appConfig = {
  cli: { commands: {}, deployTargets: { dojo: dojoTarget } },
  _internal: { payloadConfig: Promise.resolve({ collections: [], db: {} }) },
} as unknown as FrogBotSanitizedConfig;

async function shareWith(args: string[], via: 'share' | 'deploy') {
  const root = await tempDir();
  const fake = await startFakeDojo();
  const io = testIO({
    cwd: root,
    env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
  });

  await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

  const code =
    via === 'share'
      ? await runShare(args, io.io)
      : await deploy(['dojo', ...args], { config: appConfig, io: io.io });

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

  it('runs the same function as share: same requests, same output', async () => {
    const shared = await shareWith(['--no-data'], 'share');
    const deployed = await shareWith(['--no-data'], 'deploy');

    expect(shared.code).toBe(0);
    expect(deployed).toEqual(shared);
    expect(shared.paths).toContain('POST /api/apps/1/deployments');
  });

  it('writes only the JSON result on stdout under --json, the progress on stderr', async () => {
    const root = await tempDir();
    const fake = await startFakeDojo();
    const io = testIO({
      cwd: root,
      env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
    });

    await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

    expect(await runShare(['--json', '--no-data'], io.io)).toBe(0);
    expect(io.stdout()).toHaveLength(1);
    expect(JSON.parse(io.stdout()[0] ?? '')).toMatchObject({ target: 'dojo', ok: true });
    expect(io.stderr().some((line) => line.startsWith('[build] '))).toBe(true);
  });

  it('dry-runs: lists files, size and keys and makes no request', async () => {
    const root = await tempDir();
    const fake = await startFakeDojo();
    const io = testIO({
      cwd: root,
      env: { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: fake.url },
    });

    await writeApp(root, { '.env': 'OPENAI_API_KEY=sk-test-1234567890\n' });

    expect(await runShare(['--dry-run'], io.io)).toBe(0);
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

    expect(await runShare(['--no-interactive', '--no-data'], io.io)).toBe(0);
    expect(io.asked).toEqual([]);
  });
});

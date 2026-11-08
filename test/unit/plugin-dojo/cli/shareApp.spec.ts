import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runShare } from '../../../../packages/plugins/plugin-dojo/src/cli/run.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

async function setup(files?: Record<string, string>, extraEnv: Record<string, string> = {}) {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url, ...extraEnv };

  await writeApp(root, files);
  dojo.apps.push({ id: 7, name: 'deals', slug: 'deals', workspace: 1 });

  const run = async (args: string[]) => {
    const io = testIO({ cwd: root, env });

    return { code: await runShare(args, io.io), ...io };
  };

  const signIn = async () => {
    dojo.tokens.set('fb_stored', 100);
    await writeToken(env, dojo.url, 'fb_stored');
  };

  return { root, dojo, run, signIn };
}

const readLink = async (root: string) =>
  JSON.parse(await readFile(join(root, '.frogbot/app.json'), 'utf8')) as unknown;

describe('frogbot share --app', () => {
  it('links an unlinked folder to the named app, then ships to it without creating one', async () => {
    const { root, dojo, run, signIn } = await setup();

    await signIn();

    const result = await run(['--app', 'deals', '--yes', '--no-data']);

    expect(result.code).toBe(0);
    expect(await readLink(root)).toEqual({ appId: 7 });
    expect(dojo.paths()).toContain('GET /api/apps/deals/cli');
    expect(dojo.paths()).toContain('POST /api/apps/7/deployments');
    expect(dojo.paths()).not.toContain('POST /api/apps');
    expect(dojo.apps).toHaveLength(1);
  });

  it('ships to the app when the folder is already linked to it', async () => {
    const { root, dojo, run, signIn } = await setup({ '.frogbot/app.json': '{"appId":7}' });

    await signIn();

    expect((await run(['--app', 'deals', '--no-data'])).code).toBe(0);
    expect(await readLink(root)).toEqual({ appId: 7 });
    expect(dojo.paths()).toContain('POST /api/apps/7/deployments');
  });

  it('writes no link when Dojo refuses the upload', async () => {
    const { root, dojo, run, signIn } = await setup();

    dojo.replies.set('POST /api/apps/7/deployments', {
      status: 500,
      body: { errors: [{ message: 'Dojo is down.' }] },
    });

    await signIn();

    const result = await run(['--app', 'deals', '--yes', '--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr().join('\n')).toContain('Dojo refused the upload');
    await expect(readFile(join(root, '.frogbot/app.json'), 'utf8')).rejects.toThrow();
  });

  it('keeps the link when the build fails, since the app has the new version', async () => {
    const { root, dojo, run, signIn } = await setup();

    dojo.build.status = 'failed';
    await signIn();

    const result = await run(['--app', 'deals', '--yes', '--no-data']);

    expect(result.code).toBe(1);
    expect(await readLink(root)).toEqual({ appId: 7 });
  });

  it('stops naming both apps when the folder is linked to another one', async () => {
    const { root, dojo, run, signIn } = await setup({ '.frogbot/app.json': '{"appId":3}' });

    await signIn();

    const result = await run(['--app', 'deals', '--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] This folder is linked to app 3 in .frogbot/app.json, not deals (7). Delete .frogbot/app.json to link it to deals.',
    ]);
    expect(await readLink(root)).toEqual({ appId: 3 });
    expect(dojo.paths().some((path) => path.endsWith('/deployments'))).toBe(false);
  });

  it('stops naming an app that does not exist, and writes no link', async () => {
    const { root, dojo, run, signIn } = await setup();

    await signIn();

    const result = await run(['--app', 'nope', '--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr().join('\n')).toContain('Couldn\'t find the app "nope"');
    await expect(readFile(join(root, '.frogbot/app.json'), 'utf8')).rejects.toThrow();
    expect(dojo.paths().some((path) => path.endsWith('/deployments'))).toBe(false);
  });

  it('stops on an app the caller may not deploy, and writes no link', async () => {
    const { root, dojo, run, signIn } = await setup();

    dojo.forbidden.add(7);
    await signIn();

    const result = await run(['--app', 'deals', '--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr().join('\n')).toContain('Couldn\'t find the app "deals"');
    await expect(readFile(join(root, '.frogbot/app.json'), 'utf8')).rejects.toThrow();
  });

  it('refuses an empty --app, as an unset CI variable gives, instead of creating an app', async () => {
    const { dojo, run } = await setup();

    const result = await run(['--app', '', '--no-data']);

    expect(result.code).toBe(2);
    expect(result.stderr().join('\n')).toContain("--app needs an app's slug or id.");
    expect(dojo.requests).toEqual([]);
  });

  it('refuses --app with --name or --workspace before any request', async () => {
    const { dojo, run } = await setup();

    const result = await run(['--app', 'deals', '--name', 'other']);

    expect(result.code).toBe(2);
    expect(result.stderr().join('\n')).toContain(
      '--app shares to an app that already exists; --workspace and --name are for a new one.',
    );
    expect(dojo.requests).toEqual([]);
  });
});

describe('frogbot share in CI', () => {
  it('uses FROGBOT_DOJO_TOKEN and never starts the device sign-in', async () => {
    const { dojo, run } = await setup(undefined, { CI: 'true', FROGBOT_DOJO_TOKEN: 'fb_ci' });

    dojo.tokens.set('fb_ci', 100);

    const result = await run(['--app', 'deals', '--yes', '--no-data']);

    expect(result.code).toBe(0);
    expect(dojo.paths()).not.toContain('POST /api/cli/device/code');
    expect(dojo.requests.every((request) => request.headers.authorization === 'Bearer fb_ci')).toBe(
      true,
    );
  });

  it('stops at once naming FROGBOT_DOJO_TOKEN when CI has no sign-in, with no code printed', async () => {
    const { dojo, run } = await setup(undefined, { CI: 'true' });

    const result = await run(['--app', 'deals', '--yes', '--no-data']);

    expect(result.code).toBe(1);
    expect(result.stderr().join('\n')).toContain('Set FROGBOT_DOJO_TOKEN to a Dojo API key');
    expect(result.stdout().join('\n')).not.toContain('Code:');
    expect(dojo.paths()).not.toContain('POST /api/cli/device/code');
  });
});

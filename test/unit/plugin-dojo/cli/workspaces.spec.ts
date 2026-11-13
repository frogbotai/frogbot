import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runShare } from '../../../../packages/plugins/plugin-dojo/src/cli/run.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

const personal = { id: 3, name: "Colby's workspace", slug: 'colby' };

async function setup() {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  await writeApp(root);
  dojo.workspaces = [];

  const run = async (options: Omit<Parameters<typeof testIO>[0], 'cwd' | 'env'> = {}) => {
    const io = testIO({ cwd: root, env, ...options });

    return { code: await runShare(['--no-data'], io.io), ...io };
  };

  const signIn = async () => {
    dojo.tokens.set('fb_stored', 100);
    await writeToken(env, dojo.url, 'fb_stored');
  };

  return { root, dojo, run, signIn };
}

describe('frogbot share: no workspace', () => {
  it('reads the workspaces after signing in, so the one Dojo made at sign-in is used without asking', async () => {
    const { dojo, run } = await setup();

    dojo.afterRequest = (route) => {
      if (route === 'POST /api/cli/device/token' && dojo.tokens.size > 0) {
        dojo.workspaces = [personal];
      }
    };

    const result = await run({ isTTY: true });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(dojo.apps[0]?.workspace).toBe(3);
    expect(result.stdout()).toContain(
      `[frogbot] Created deals-app in Colby's workspace, linked in .frogbot/app.json.`,
    );
  });

  it('names the command that makes one without a TTY, and creates nothing', async () => {
    const { root, dojo, run, signIn } = await setup();

    await signIn();

    const result = await run();

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] Your Dojo account has no workspace yet. Create one with frogbot dojo workspaces create <name>, then rerun.',
    ]);
    expect(dojo.paths()).not.toContain('POST /api/apps');
    await expect(stat(join(root, '.frogbot'))).rejects.toThrow();
  });

  it('opens the page to make one with a TTY, checks again on Enter, and finishes the share', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    dojo.afterRequest = (route) => {
      if (route === 'GET /api/workspaces') dojo.workspaces = [personal];
    };

    const result = await run({ isTTY: true, confirm: true });
    const create = `${dojo.url}/collections/workspaces/create`;

    expect(result.code).toBe(0);
    expect(result.stdout().slice(0, 2)).toEqual([
      '[frogbot] Your Dojo account has no workspace yet. Create one here, then come back:',
      create,
    ]);
    expect(result.opened).toEqual([create]);
    expect(result.asked).toEqual(['Created it? Check again']);
    expect(dojo.paths().filter((path) => path === 'GET /api/workspaces')).toHaveLength(2);
    expect(dojo.apps[0]?.workspace).toBe(3);
    expect(result.stdout().at(-1)).toBe('https://deals.frogbot.app');
  });

  it('stops when the person says no', async () => {
    const { dojo, run, signIn } = await setup();

    await signIn();

    const result = await run({ isTTY: true, confirm: false });

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] No workspace to share in. Create one with frogbot dojo workspaces create <name>, then rerun.',
    ]);
    expect(dojo.paths()).not.toContain('POST /api/apps');
  });
});

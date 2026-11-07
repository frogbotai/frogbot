import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

async function setup(env: Record<string, string> = {}) {
  const dojo = await startFakeDojo();
  const cwd = await tempDir();
  const fullEnv = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url, ...env };

  dojo.level = 'owner';
  dojo.projects.push({ id: 7, name: 'Deals', slug: 'deals', workspace: 1 });

  const run = async (args: string[], options: { isTTY?: boolean; confirm?: boolean } = {}) => {
    const result = testIO({ cwd, env: fullEnv, ...options });

    return { code: await runDojo(args, result.io), ...result };
  };

  return { dojo, cwd, env: fullEnv, run };
}

describe('FROGBOT_DOJO_TOKEN', () => {
  it('beats the stored token', async () => {
    const { dojo, env, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);
    dojo.tokens.set('fb_stored', 100);
    await writeToken(env, dojo.url, 'fb_stored');

    const result = await run(['apps', 'get', 'deals']);

    expect(result.code).toBe(0);
    expect(dojo.requests.map(({ headers }) => headers.authorization)).toEqual(['Bearer fb_env']);
  });

  it('fails on a 401 without starting the device flow', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_revoked' });
    const result = await run(['apps', 'get', 'deals']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      `[frogbot] Dojo didn't accept FROGBOT_DOJO_TOKEN at ${dojo.url}; it may be revoked. Set a working key, or unset it to sign in with a browser.`,
    ]);
    expect(dojo.paths()).toEqual(['GET /api/apps/deals']);
  });

  it('makes whoami and login fail the same way', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_revoked' });

    expect((await run(['whoami'])).code).toBe(1);
    expect((await run(['login'])).code).toBe(1);
    expect(dojo.paths()).not.toContain('POST /api/cli/device/code');
  });
});

describe('signing in', () => {
  it('signs in with login and shows the account and workspaces', async () => {
    const { dojo, run } = await setup();
    const result = await run(['login']);

    expect(result.code).toBe(0);
    expect(result.stdout().slice(-2)).toEqual([
      `[frogbot] Signed in to ${dojo.url} as colby@example.com.`,
      'trend-capital  Trend Capital',
    ]);
  });

  it('tells whoami to log in instead of signing in itself', async () => {
    const { dojo, run } = await setup();
    const result = await run(['whoami']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([`[frogbot] Not signed in to ${dojo.url}. Run frogbot login.`]);
    expect(dojo.requests).toEqual([]);
  });
});

describe('destructive verbs', () => {
  it.each([
    [['apps', 'delete', 'deals']],
    [['members', 'remove', 'ada@example.com']],
    [['keys', 'revoke', '4']],
    [['sharing', 'leave', 'deals']],
    [['env', 'unset', 'deals', 'MODE']],
  ])('%j exits 2 naming --yes without a terminal', async (args) => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });
    const result = await run(args);

    expect(result.code).toBe(2);
    expect(result.stderr()[0]).toMatch(
      /^\[frogbot\] There's no terminal to confirm in: rerun with --yes\./,
    );
    expect(dojo.requests).toEqual([]);
  });

  it('asks with a terminal and stops when the answer is no', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });
    const result = await run(['apps', 'delete', 'deals'], { isTTY: true, confirm: false });

    expect(result.code).toBe(1);
    expect(result.asked).toEqual(["Delete deals and everything in it? This can't be undone."]);
    expect(result.stderr()).toEqual(['[frogbot] Cancelled.']);
    expect(dojo.requests).toEqual([]);
  });
});

describe('refusals', () => {
  it('names the access a 403 needs', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);

    dojo.replies.set('PUT /api/apps/7/keys', {
      status: 403,
      body: { errors: [{ message: "Only this app's owners can see or change its keys." }] },
    });

    const result = await run(['env', 'set', 'deals', 'MODE=live']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Couldn't change the keys of deals: Only this app's owners can see or change its keys. It needs owner access to the app.",
    ]);
  });

  it('prints the upgrade link on a 402', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);
    dojo.billing = { paidApps: 0 };

    const result = await run(['apps', 'create', 'CRM']);

    expect(result.code).toBe(1);
    expect(result.stdout().join('\n')).toContain(`${dojo.url}/billing/upgrade?workspace=1&apps=1`);
  });

  it('prints the browser link and exits 1 when Dojo refuses keys create', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);

    dojo.replies.set('POST /api/api-keys/mint', {
      status: 403,
      body: {
        error:
          "This API key can't mint or rotate API keys. Sign in, or use a key that can mint keys.",
      },
    });

    const result = await run(['keys', 'create', 'ci', '--json']);

    expect(result.code).toBe(1);
    expect(result.stdout()).toEqual([]);
    expect(result.stderr()).toEqual([
      `[frogbot] This sign-in can't create keys yet: This API key can't mint or rotate API keys. Sign in, or use a key that can mint keys. Create one at ${dojo.url}/collections/api-keys`,
    ]);
  });
});

describe('--json', () => {
  it('leaves stdout to the share result and sends progress to stderr', async () => {
    const { dojo, cwd, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);
    dojo.projects.length = 0;
    await writeApp(cwd);

    const result = await run(['apps', 'share', '--no-data', '--json']);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      appId: 1,
      url: 'https://deals.frogbot.app',
      shareLink: `${dojo.url}/collections/projects/1?share=1`,
    });
    expect(result.stderr()).toContain('[build] step 1');
  });

  it('refuses logs --follow, which never ends in one value', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });
    const result = await run(['apps', 'logs', 'deals', '--follow', '--json']);

    expect(result.code).toBe(2);
    expect(result.stderr()[0]).toContain(
      "--follow keeps printing, so it can't end in one JSON value.",
    );
    expect(dojo.requests).toEqual([]);
  });

  it('prints logs as one value', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);
    dojo.logs.push({ at: '2026-11-07T00:00:00Z', message: 'ready' });

    const result = await run(['apps', 'logs', 'deals', '--json']);

    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      lines: [{ at: '2026-11-07T00:00:00Z', message: 'ready' }],
      next: '1',
    });
    expect(result.stderr()).toEqual([]);
  });
});

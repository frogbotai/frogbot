import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import type { FakeDojo } from './fakeDojo.js';
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

  it('fails on a 401 without falling back to the stored token or the device flow', async () => {
    const { dojo, env, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_revoked' });

    dojo.tokens.set('fb_stored', 100);
    await writeToken(env, dojo.url, 'fb_stored');

    const result = await run(['apps', 'get', 'deals']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      `[frogbot] Dojo didn't accept FROGBOT_DOJO_TOKEN at ${dojo.url}; it may be revoked. Set a working key, or unset it to sign in with a browser.`,
    ]);
    expect(dojo.paths()).toEqual(['GET /api/apps/deals/cli']);
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

const member = { id: 3, email: 'ada@example.com', role: 'member' };
const liveDomain = { domain: 'crm.acme.com', record: null, status: 'live' };

const destructive: { args: string[]; asked: string; replies?: Record<string, unknown> }[] = [
  {
    args: ['apps', 'delete', 'deals'],
    asked: "Delete deals and everything in it? This can't be undone.",
  },
  {
    args: ['members', 'remove', 'ada@example.com'],
    asked: 'Remove ada@example.com from the workspace?',
    replies: { 'GET /api/members': { docs: [member] } },
  },
  { args: ['keys', 'revoke', '4'], asked: 'Revoke key 4 and the keys it made?' },
  {
    args: ['sharing', 'leave', 'deals'],
    asked: "Leave deals? You'll need a new invite to get back.",
  },
  { args: ['env', 'unset', 'deals', 'MODE'], asked: 'Remove MODE from deals?' },
  {
    args: ['domains', 'clear', 'deals'],
    asked: 'Remove the custom domain of deals? It stops reaching the app.',
  },
  {
    args: ['domains', 'set', 'deals', 'www.acme.com'],
    asked: 'Replace crm.acme.com with www.acme.com on deals?',
    replies: { 'GET /api/apps/7/domain': liveDomain },
  },
];

const changes = (dojo: FakeDojo) => dojo.paths().filter((route) => !route.startsWith('GET '));

describe('destructive verbs', () => {
  it.each(destructive)(
    '$args exits 2 naming --yes without a terminal',
    async ({ args, replies = {} }) => {
      const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

      dojo.tokens.set('fb_env', 50);

      for (const [route, body] of Object.entries(replies)) dojo.replies.set(route, { body });

      for (const extra of [[], ['--json']]) {
        const result = await run([...args, ...extra]);

        expect(result.code).toBe(2);
        expect(result.stderr()[0]).toMatch(
          /^\[frogbot\] There's no terminal to confirm in: rerun with --yes\./,
        );
      }

      expect(changes(dojo)).toEqual([]);
    },
  );

  it.each(destructive)(
    '$args asks with a terminal and stops when the answer is no',
    async ({ args, asked, replies = {} }) => {
      const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

      dojo.tokens.set('fb_env', 50);

      dojo.replies.set('GET /api/projects', {
        body: { docs: [{ id: 7, slug: 'deals', name: 'Deals' }] },
      });

      for (const [route, body] of Object.entries(replies)) dojo.replies.set(route, { body });

      const result = await run(args, { isTTY: true, confirm: false });

      expect(result.code).toBe(1);
      expect(result.asked).toEqual([asked]);
      expect(result.stderr()).toEqual(['[frogbot] Cancelled.']);
      expect(changes(dojo)).toEqual([]);
    },
  );

  it('sets a first domain without asking', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);

    dojo.replies.set('GET /api/apps/7/domain', {
      body: { domain: null, record: null, status: null },
    });

    dojo.replies.set('PUT /api/apps/7/domain', { body: liveDomain });

    const result = await run(['domains', 'set', 'deals', 'crm.acme.com']);

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(changes(dojo)).toEqual(['PUT /api/apps/7/domain']);
  });

  it('names the app it found in the delete question, and deletes that app by id', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 50);
    dojo.replies.set('DELETE /api/projects/7', { body: { doc: { id: 7, slug: 'deals' } } });

    const result = await run(['apps', 'delete', '7'], { isTTY: true, confirm: true });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual(["Delete deals and everything in it? This can't be undone."]);
    expect(changes(dojo)).toEqual(['DELETE /api/projects/7']);
  });
});

describe('secrets', () => {
  it('never prints the sign-in token or a key value, with or without --json', async () => {
    const { dojo, run } = await setup({ FROGBOT_DOJO_TOKEN: 'fb_env' });

    dojo.tokens.set('fb_env', 100);

    dojo.replies.set('PUT /api/apps/7/keys', {
      body: { changed: ['STRIPE_KEY'], retrying: false },
    });

    dojo.replies.set('GET /api/api-keys', {
      body: { docs: [{ id: 100, name: 'CLI', prefix: 'fb_e', canMint: true, createdAt: 'x' }] },
    });

    const commands = [
      ['env', 'set', 'deals', 'STRIPE_KEY=sk_live_supersecret'],
      ['env', 'list', 'deals'],
      ['whoami'],
      ['login'],
      ['logout'],
      ['keys', 'list'],
      ['apps', 'get', 'deals'],
    ];

    for (const args of commands) {
      for (const extra of [[], ['--json']]) {
        const result = await run([...args, ...extra]);
        const printed = [...result.stdout(), ...result.stderr()].join('\n');

        expect(printed, args.join(' ')).not.toContain('fb_env');
        expect(printed, args.join(' ')).not.toContain('sk_live_supersecret');
      }
    }
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
      target: 'dojo',
      ok: true,
      dryRun: false,
      issues: [],
      result: {
        appId: 1,
        url: 'https://deals.frogbot.app',
        shareLink: `${dojo.url}/collections/projects/1?share=1`,
      },
    });
    expect(result.stderr()).toContain('[build] step 1');
  });

  it('names apps share in the usage line of frogbot dojo', async () => {
    const cwd = await tempDir();
    const result = testIO({ cwd, env: { XDG_CONFIG_HOME: await tempDir() } });

    await writeApp(cwd);

    const code = await runDojo(['apps', 'share', '--nope', '--json'], {
      ...result.io,
      program: 'frogbot dojo',
    });

    expect(code).toBe(2);
    expect(result.stderr().join('\n')).toContain(
      'Usage: frogbot dojo apps share [--app <slug or id>] [--data',
    );
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({ target: 'dojo', ok: false });
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

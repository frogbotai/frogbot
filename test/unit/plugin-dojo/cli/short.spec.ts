import { describe, expect, it } from 'vitest';

import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeFiles } from './helpers.js';

type Reply = { status?: number; body: unknown };

const app = {
  id: 7,
  slug: 'deals',
  url: 'https://deals.frogbot.app',
  status: 'live',
  deployment: 30,
  started: true,
};

const deploy = (id: number, fields: Record<string, unknown> = {}) => ({
  id,
  status: 'ready',
  runtimeStatus: 'superseded',
  createdAt: `2026-11-20T00:${id}:00Z`,
  liveAt: `2026-11-20T01:${id}:00Z`,
  ...fields,
});

async function setup({
  linked = true,
  isTTY = false,
  app: appFields = {},
  replies = {},
}: {
  linked?: boolean;
  isTTY?: boolean;
  app?: Record<string, unknown>;
  replies?: Record<string, Reply>;
} = {}) {
  const dojo = await startFakeDojo();
  const cwd = await tempDir();
  const env = {
    XDG_CONFIG_HOME: await tempDir(),
    FROGBOT_DOJO_URL: dojo.url,
    FROGBOT_DOJO_TOKEN: 'fb_env',
  };

  dojo.tokens.set('fb_env', 100);
  dojo.level = 'owner';
  dojo.apps.push({ id: 7, name: 'Deals', slug: 'deals', workspace: 1 });

  for (const [route, reply] of Object.entries({
    'GET /api/apps/7/cli': { body: { ...app, ...appFields } },
    'GET /api/apps/deals/cli': { body: { ...app, ...appFields } },
    ...replies,
  })) {
    dojo.replies.set(route, reply);
  }

  if (linked) await writeFiles(cwd, { '.frogbot/app.json': '{ "appId": 7 }' });

  const run = async (...args: string[]) => {
    const io = testIO({ cwd, env, isTTY, confirm: true });

    return { code: await runDojo(args, io.io), ...io };
  };

  return { dojo, run };
}

const paths = (dojo: FakeDojo) => dojo.requests.map(({ method, path }) => `${method} ${path}`);

const keysChanged = {
  'PUT /api/apps/7/keys': { body: { changed: ['STRIPE_KEY'], retrying: false } },
};

const deployments = (...docs: unknown[]) => ({
  'GET /api/deployments': { body: { docs } },
});

describe("frogbot dojo's daily commands", () => {
  it('status reads the folder’s app and its last deploy', async () => {
    const { dojo, run } = await setup({
      replies: deployments(deploy(30, { runtimeStatus: 'live' })),
    });

    const result = await run('status', '--json');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      app: 'deals',
      url: 'https://deals.frogbot.app',
      status: 'live',
      running: true,
      liveDeployment: 30,
      lastDeploy: {
        id: 30,
        status: 'ready',
        runtimeStatus: 'live',
        failed: false,
        createdAt: '2026-11-20T00:30:00Z',
        finishedAt: null,
        error: null,
      },
    });
    expect(paths(dojo)).toContain('GET /api/apps/7/cli');

    const query = dojo.requests.find(({ path }) => path === '/api/deployments')?.search ?? '';

    expect(decodeURIComponent(query)).toContain('where[app][equals]=7');
    expect(decodeURIComponent(query)).toContain('where[status][not_equals]=cancelled');
  });

  it('status says the last deploy failed and points at logs', async () => {
    const { run } = await setup({
      replies: {
        'GET /api/apps/7/cli': { body: { ...app, status: 'failed', deployment: null } },
        ...deployments(deploy(31, { status: 'failed', liveAt: null, error: 'pnpm build failed' })),
      },
    });

    const result = await run('status');

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual([
      'deals  https://deals.frogbot.app',
      'Status: failed',
      'Last deploy: 31  failed/superseded  2026-11-20T00:31:00Z',
      '[frogbot] pnpm build failed',
      'frogbot dojo logs shows why.',
    ]);
  });

  it('status takes an app by name in any folder', async () => {
    const { dojo, run } = await setup({ linked: false, replies: deployments() });

    const result = await run('status', 'deals', '--json');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      app: 'deals',
      lastDeploy: null,
    });
    expect(paths(dojo)).toContain('GET /api/apps/deals/cli');
  });

  it.each([['status'], ['open'], ['rollback'], ['logs'], ['env', 'set', 'KEY=1']])(
    'without .frogbot/app.json, %j is a usage error naming frogbot deploy',
    async (...args) => {
      const { dojo, run } = await setup({ linked: false });

      const result = await run(...args, '--json');

      expect(result.code).toBe(2);
      expect(result.stderr().join('\n')).toContain(
        'Run this in a folder you deployed with frogbot deploy, or name the app.',
      );
      expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({ ok: false });
      expect(dojo.requests).toEqual([]);
    },
  );

  it('open prints the address and opens it at a terminal', async () => {
    const { run } = await setup({ isTTY: true });

    const result = await run('open');

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual(['https://deals.frogbot.app']);
    expect(result.opened).toEqual(['https://deals.frogbot.app']);
  });

  it('open never opens a browser without a terminal', async () => {
    const { run } = await setup();

    const result = await run('open', '--json');

    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      app: 'deals',
      url: 'https://deals.frogbot.app',
      opened: false,
    });
    expect(result.opened).toEqual([]);
  });

  it('rollback goes to the newest version that went live before the current one', async () => {
    const { dojo, run } = await setup({
      replies: {
        ...deployments(
          deploy(32, { status: 'failed', liveAt: null, runtimeStatus: null }),
          deploy(30, { runtimeStatus: 'live' }),
          deploy(29, { status: 'ready', liveAt: null, runtimeStatus: 'failed' }),
          deploy(28),
          deploy(27),
        ),
        'POST /api/apps/7/deployments/28/rollback': { status: 201, body: { deploymentId: 33 } },
      },
    });

    const result = await run('rollback', '--json');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      app: 'deals',
      rolledBackTo: '28',
      deploymentId: 33,
    });
    expect(paths(dojo)).toContain('POST /api/apps/7/deployments/28/rollback');
  });

  it('a second rollback goes further back, not to the build the first one left', async () => {
    const { dojo, run } = await setup({
      app: { deployment: 33 },
      replies: {
        ...deployments(
          deploy(33, { runtimeStatus: 'live', rollbackOf: 28 }),
          deploy(30),
          deploy(28),
          deploy(27),
        ),
        'POST /api/apps/7/deployments/27/rollback': { status: 201, body: { deploymentId: 34 } },
      },
    });

    const result = await run('rollback', '--json');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({ rolledBackTo: '27' });
    expect(paths(dojo)).toContain('POST /api/apps/7/deployments/27/rollback');
  });

  it('rollback skips a deployment that went live after the current one', async () => {
    const { dojo, run } = await setup({
      replies: {
        ...deployments(
          deploy(30, { runtimeStatus: 'live' }),
          deploy(29, { liveAt: '2026-11-20T01:31:00Z' }),
          deploy(28),
        ),
        'POST /api/apps/7/deployments/28/rollback': { status: 201, body: { deploymentId: 33 } },
      },
    });

    expect((await run('rollback')).code).toBe(0);
    expect(paths(dojo)).toContain('POST /api/apps/7/deployments/28/rollback');
  });

  it('rollback refuses when the version the current one restored is out of reach', async () => {
    const { dojo, run } = await setup({
      app: { deployment: 33 },
      replies: deployments(deploy(33, { runtimeStatus: 'live', rollbackOf: 5 }), deploy(30)),
    });

    expect((await run('rollback')).code).toBe(2);
    expect(paths(dojo).some((path) => path.endsWith('/rollback'))).toBe(false);
  });

  it('rollback takes an explicit id', async () => {
    const { dojo, run } = await setup({
      replies: {
        'POST /api/apps/7/deployments/27/rollback': { status: 201, body: { deploymentId: 33 } },
      },
    });

    expect((await run('rollback', '27')).code).toBe(0);
    expect(paths(dojo)).toContain('POST /api/apps/7/deployments/27/rollback');
    expect(paths(dojo)).not.toContain('GET /api/deployments');
  });

  it('rollback with no earlier live version exits 2 and calls no rollback', async () => {
    const { dojo, run } = await setup({
      replies: deployments(deploy(30, { runtimeStatus: 'live' })),
    });

    const result = await run('rollback');

    expect(result.code).toBe(2);
    expect(result.stderr().join('\n')).toContain(
      'deals has no earlier live version to go back to.',
    );
    expect(paths(dojo).some((path) => path.endsWith('/rollback'))).toBe(false);
  });

  it('logs prints the runtime log when the last deploy is fine', async () => {
    const { dojo, run } = await setup({
      replies: deployments(deploy(30, { runtimeStatus: 'live' })),
    });

    dojo.logs.push({ at: '2026-11-25T00:00:00Z', message: 'listening' });

    const result = await run('logs');

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual(['2026-11-25T00:00:00Z listening']);
    expect(paths(dojo)).toContain('GET /api/apps/7/logs');
  });

  it('logs shows the build log when the last deploy failed', async () => {
    const { dojo, run } = await setup({
      replies: deployments(
        deploy(31, {
          status: 'failed',
          liveAt: null,
          error: 'pnpm build failed',
          logTail: ['> next build', 'Type error'],
        }),
      ),
    });

    const result = await run('logs', '--json');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      source: 'build',
      deploymentId: 31,
      status: 'failed',
      error: 'pnpm build failed',
      lines: ['> next build', 'Type error'],
    });
    expect(paths(dojo)).not.toContain('GET /api/apps/7/logs');
  });

  it('logs --follow on a failed deploy prints its log and returns', async () => {
    const { run } = await setup({
      replies: deployments(
        deploy(31, {
          status: 'ready',
          runtimeStatus: 'failed',
          runtimeError: 'health check failed',
          runtimeLogTail: ['boot', 'crash'],
        }),
      ),
    });

    const result = await run('logs', '--follow');

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual([
      'boot',
      'crash',
      '[frogbot] The last deploy of deals (31) failed to start: health check failed. These are its start logs; frogbot deploy ships a fix.',
    ]);
  });

  it('env set KEY=1 sets the key on the folder’s app', async () => {
    const { dojo, run } = await setup({ replies: keysChanged });

    const result = await run('env', 'set', 'STRIPE_KEY=sk_1');

    expect(result.code).toBe(0);

    const put = dojo.requests.find(({ method }) => method === 'PUT');

    expect(put?.path).toBe('/api/apps/7/keys');
    expect(JSON.parse(put?.body.toString() ?? '')).toEqual({ values: { STRIPE_KEY: 'sk_1' } });
  });

  it('env set still reads a first argument with no = as the app', async () => {
    const { dojo, run } = await setup({ linked: false, replies: keysChanged });

    expect((await run('env', 'set', 'deals', 'STRIPE_KEY=sk_1')).code).toBe(0);
    expect(paths(dojo)).toContain('PUT /api/apps/7/keys');
  });

  it.each([
    [['apps', 'get'], 'GET /api/apps/7/cli'],
    [['deployments', 'list'], 'GET /api/deployments'],
    [['deployments', 'rollback', '27'], 'POST /api/apps/7/deployments/27/rollback'],
    [['env', 'unset', 'STRIPE_KEY', 'OTHER', '--yes'], 'PUT /api/apps/7/keys'],
    [['sharing', 'invite', 'ana@example.com'], 'POST /api/apps/7/invite'],
  ])('long form %j acts on the folder’s app', async (args, route) => {
    const { dojo, run } = await setup({
      replies: {
        ...deployments(),
        ...keysChanged,
        'POST /api/apps/7/deployments/27/rollback': { status: 201, body: { deploymentId: 33 } },
        'POST /api/apps/7/invite': {
          body: { created: ['ana@example.com'], existing: [], failed: [] },
        },
      },
    });

    const result = await run(...args);

    expect(result.stderr()).toEqual([]);
    expect(result.code).toBe(0);
    expect(paths(dojo)).toContain(route);
  });

  it('lists the daily commands first in --help', async () => {
    const { run } = await setup();

    const result = await run('--help');
    const out = result.stdout();
    const daily = out.findIndex((line) => line.startsWith('Daily'));
    const commands = out.indexOf('Commands:');

    expect(result.code).toBe(0);
    expect(out.slice(daily + 1, commands).map((line) => line.trim().split(' ')[0])).toEqual([
      'logs',
      'status',
      'open',
      'rollback',
      'env',
    ]);
  });

  it('--help --json lists every command, verb and flag as one value', async () => {
    const { run } = await setup();

    const result = await run('--help', '--json');
    const help = JSON.parse(result.stdout().join('\n')) as {
      program: string;
      commands: {
        name: string;
        daily?: boolean;
        verbs?: { name: string; usage: string; flags: { name: string }[] }[];
      }[];
    };

    expect(result.code).toBe(0);
    expect(help.program).toBe('frogbot');
    expect(help.commands.filter((command) => command.daily).map(({ name }) => name)).toEqual([
      'logs',
      'status',
      'open',
      'rollback',
    ]);

    const remove = help.commands
      .find(({ name }) => name === 'apps')
      ?.verbs?.find(({ name }) => name === 'apps delete');

    expect(remove?.usage).toBe('frogbot apps delete [app] [--yes] [--json] [--wait]');
    expect(remove?.flags.map(({ name }) => name)).toEqual(['--yes', '--json', '--wait']);
  });

  it.each([
    [['apps', '--help', '--json'], 'apps'],
    [['status', '--help', '--json'], 'status'],
    [['apps', 'delete', '--help', '--json'], 'apps delete'],
  ])('%j prints one JSON value', async (args, name) => {
    const { run } = await setup();

    const result = await run(...args);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({ name });
  });
});

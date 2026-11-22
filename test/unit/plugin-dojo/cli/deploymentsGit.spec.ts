import { describe, expect, it } from 'vitest';

import type { Noun } from '../../../../packages/plugins/plugin-dojo/src/cli/command.js';
import { verbHelp } from '../../../../packages/plugins/plugin-dojo/src/cli/command.js';
import {
  dojoCommands,
  runDojo,
} from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import {
  shareOptions,
  shareUsage,
} from '../../../../packages/plugins/plugin-dojo/src/cli/flags.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

type Reply = { status?: number; body: unknown };

type Options = { isTTY?: boolean; confirm?: boolean; secret?: string };

const repo = {
  provider: 'gitlab',
  instanceURL: '',
  repoID: '42',
  repoName: 'acme/deals',
  branch: 'main',
  folder: 'apps/web',
  status: 'active',
};

async function setup(replies: Record<string, Reply> = {}) {
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

  for (const [route, reply] of Object.entries(replies)) dojo.replies.set(route, reply);

  const run = async (args: string[], { secret, ...options }: Options = {}) => {
    const result = testIO({ cwd, env, ...options });
    const secrets: string[] = [];
    const io = {
      ...result.io,
      ...(secret !== undefined && {
        readSecret: (message: string) => {
          secrets.push(message);

          return Promise.resolve(secret);
        },
      }),
    };

    return { code: await runDojo(args, io), secrets, ...result };
  };

  return { dojo, run };
}

const changes = (dojo: FakeDojo) => dojo.paths().filter((route) => !route.startsWith('GET '));

const request = (dojo: FakeDojo, route: string) =>
  dojo.requests.find((each) => `${each.method} ${each.path}` === route);

const deployment = (fields: Record<string, unknown>) => ({
  'GET /api/deployments/41': {
    body: { id: 41, app: 7, createdAt: '2026-11-22T10:00:00Z', ...fields },
  },
});

describe('deployments get', () => {
  it('prints the status and exits 0 on a live deployment, with the same facts as JSON', async () => {
    const { dojo, run } = await setup(
      deployment({
        status: 'ready',
        runtimeStatus: 'live',
        trigger: 'git',
        commit: 'abcdef0123',
        branch: 'main',
        finishedAt: '2026-11-22T10:02:00Z',
      }),
    );

    const text = await run(['deployments', 'get', '41']);

    expect(text.code).toBe(0);
    expect(text.stdout()).toEqual([
      '41  ready/live',
      'Started 2026-11-22T10:00:00Z, finished 2026-11-22T10:02:00Z',
      'From abcdef0 on main',
    ]);
    expect(request(dojo, 'GET /api/deployments/41')?.search).toBe('?depth=0');

    const json = await run(['deployments', 'get', '41', '--json']);

    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({
      id: 41,
      app: 7,
      status: 'ready',
      runtimeStatus: 'live',
      failed: false,
      commit: 'abcdef0123',
    });
  });

  it.each([
    [{ status: 'failed', error: 'npm ci failed' }, 'npm ci failed'],
    [
      { status: 'ready', runtimeStatus: 'failed', runtimeError: "It didn't start" },
      "It didn't start",
    ],
  ])('exits 1 with the reason when it failed: %j', async (fields, reason) => {
    const { run } = await setup(deployment(fields));

    const text = await run(['deployments', 'get', '41']);

    expect(text.code).toBe(1);
    expect(text.stdout()).toContain(`[frogbot] ${reason}`);

    const json = await run(['deployments', 'get', '41', '--json']);

    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({ failed: true });
  });

  it('points at --follow while the build runs, and exits 0', async () => {
    const { run } = await setup(deployment({ status: 'building' }));
    const result = await run(['deployments', 'get', '41']);

    expect(result.code).toBe(0);
    expect(result.stdout().at(-1)).toBe(
      'frogbot dojo deployments logs 41 --follow watches the build.',
    );
  });

  it("exits 1 when the reply isn't a deployment, without printing empty fields", async () => {
    const { run } = await setup({ 'GET /api/deployments/count': { body: { totalDocs: 3 } } });
    const result = await run(['deployments', 'get', 'count']);

    expect(result.code).toBe(1);
    expect(result.stderr()[0]).toContain('No deployment count');
    expect(result.stdout().join('\n')).not.toContain('undefined');
  });

  it('names the access a 403 needs', async () => {
    const { run } = await setup({
      'GET /api/deployments/41': { status: 403, body: { errors: [{ message: 'Forbidden' }] } },
    });

    const result = await run(['deployments', 'get', '41']);

    expect(result.code).toBe(1);
    expect(result.stderr()[0]).toContain('It needs editor or owner access to the app.');
  });
});

describe('deployments list --page', () => {
  const page = (n: number, totalPages: number) => ({
    'GET /api/deployments': {
      body: {
        docs: [{ id: 100 - n, status: 'ready', createdAt: '2026-11-07T00:00:00Z' }],
        page: n,
        totalPages,
      },
    },
  });

  it('asks for page 1 by default and says how to see older ones', async () => {
    const { dojo, run } = await setup(page(1, 3));
    const result = await run(['deployments', 'list', 'deals']);

    expect(result.code).toBe(0);
    expect(request(dojo, 'GET /api/deployments')?.search).toContain('limit=20&page=1&');
    expect(result.stdout().at(-1)).toBe('[frogbot] Page 1 of 3. Add --page 2 for older ones.');
  });

  it('sends --page, and says nothing more on the last page', async () => {
    const { dojo, run } = await setup(page(3, 3));
    const result = await run(['deployments', 'list', 'deals', '--page', '3']);

    expect(result.code).toBe(0);
    expect(request(dojo, 'GET /api/deployments')?.search).toContain('&page=3&');
    expect(result.stdout()).toEqual(['97  2026-11-07T00:00:00Z  ready']);
  });

  it.each(['0', '-1', '2.5', 'two', ''])('refuses --page %j before any request', async (value) => {
    const { dojo, run } = await setup();
    const result = await run(['deployments', 'list', 'deals', `--page=${value}`]);

    expect(result.code).toBe(2);
    expect(result.stderr()[0]).toContain('--page needs a page number from 1 up');
    expect(dojo.requests).toEqual([]);
  });
});

describe('git', () => {
  it('status shows the repo, branch and folder, and the same as JSON', async () => {
    const { run } = await setup({ 'GET /api/apps/7/repo': { body: { repo } } });

    const text = await run(['git', 'status', 'deals']);

    expect(text.code).toBe(0);
    expect(text.stdout()).toEqual([
      'gitlab  acme/deals  main  apps/web',
      '[frogbot] Each push to main deploys deals.',
    ]);

    const json = await run(['git', 'status', 'deals', '--json']);

    expect(JSON.parse(json.stdout().join('\n'))).toEqual({ app: 'deals', repo });
  });

  it("status says when Dojo lost access, and when there's no repo", async () => {
    const lost = await setup({
      'GET /api/apps/7/repo': { body: { repo: { ...repo, status: 'needs-reconnect' } } },
    });

    expect((await lost.run(['git', 'status', 'deals'])).stdout()[1]).toBe(
      '[frogbot] Dojo lost access to acme/deals, so pushes deploy nothing until an Admin connects it again.',
    );

    const none = await setup({ 'GET /api/apps/7/repo': { body: { repo: null } } });

    expect((await none.run(['git', 'status', 'deals'])).stdout()).toEqual([
      "[frogbot] deals isn't connected to a repo.",
    ]);
  });

  it('connect for GitHub prints the link for a person, opens it with a terminal, and changes nothing', async () => {
    const url = 'https://dojo.frogbot.ai/admin/collections/apps/7/deployments';
    const { dojo, run } = await setup({
      'GET /api/apps/7/repo/github/link': { body: { url } },
    });

    const piped = await run(['git', 'connect', 'deals']);

    expect(piped.code).toBe(0);
    expect(piped.stdout().at(-1)).toBe(url);
    expect(piped.opened).toEqual([]);

    const json = await run(['git', 'connect', 'deals', '--json']);

    expect(JSON.parse(json.stdout().join('\n'))).toEqual({ app: 'deals', provider: 'github', url });

    const terminal = await run(['git', 'connect', 'deals'], { isTTY: true });

    expect(terminal.opened).toEqual([url]);
    expect(changes(dojo)).toEqual([]);
  });

  it.each([
    ['--repo', '1'],
    ['--branch', 'main'],
    ['--folder', 'web'],
    ['--instance', 'https://x'],
  ])(
    'connect for GitHub refuses %s, which the person picks in the browser',
    async (flag, value) => {
      const { dojo, run } = await setup();
      const result = await run(['git', 'connect', 'deals', flag, value]);

      expect(result.code).toBe(2);
      expect(result.stderr()[0]).toContain('GitHub connects in the browser');
      expect(dojo.requests).toEqual([]);
    },
  );

  it('connect for GitLab reads the token from stdin, sends it once and never prints it', async () => {
    const { dojo, run } = await setup({ 'PUT /api/apps/7/repo': { body: { repo } } });
    const result = await run(
      [
        'git',
        'connect',
        'deals',
        '--provider',
        'gitlab',
        '--repo',
        '42',
        '--branch',
        'main',
        '--folder',
        'apps/web',
        '--instance',
        'https://gitlab.acme.com',
        '--json',
      ],
      { secret: 'glpat-secret\n' },
    );

    expect(result.code).toBe(0);
    expect(result.secrets).toEqual(["gitlab access token for deals (it isn't shown):"]);
    expect(JSON.parse(request(dojo, 'PUT /api/apps/7/repo')?.body.toString() ?? '')).toEqual({
      provider: 'gitlab',
      repoID: '42',
      credential: 'glpat-secret',
      branch: 'main',
      folder: 'apps/web',
      instanceURL: 'https://gitlab.acme.com',
    });
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({ app: 'deals', repo });
    expect([...result.stdout(), ...result.stderr()].join('\n')).not.toContain('glpat');
  });

  it('connect for GitLab refuses an empty token or no --repo before connecting', async () => {
    const { dojo, run } = await setup();

    const empty = await run(['git', 'connect', 'deals', '--provider', 'gitlab', '--repo', '42'], {
      secret: '  \n',
    });

    expect(empty.code).toBe(2);
    expect(empty.stderr()[0]).toContain('Pipe a gitlab access token on stdin');

    const noRepo = await run(['git', 'connect', 'deals', '--provider', 'gitlab'], { secret: 't' });

    expect(noRepo.code).toBe(2);
    expect(noRepo.secrets).toEqual([]);
    expect(changes(dojo)).toEqual([]);
  });

  it("connect prints Dojo's refusal with the Admin access it needs", async () => {
    const { run } = await setup({
      'PUT /api/apps/7/repo': {
        status: 403,
        body: { errors: [{ message: "Only this app's Admins can connect or disconnect a repo." }] },
      },
    });

    const result = await run(['git', 'connect', 'deals', '--provider', 'gitlab', '--repo', '42'], {
      secret: 't',
    });

    expect(result.code).toBe(1);
    expect(result.stderr()[0]).toContain(
      "Only this app's Admins can connect or disconnect a repo.",
    );
    expect(result.stderr()[0]).toContain('It needs Admin access to the app.');
  });

  it('disconnect --yes deletes the link', async () => {
    const { dojo, run } = await setup({ 'DELETE /api/apps/7/repo': { body: { repo: null } } });
    const result = await run(['git', 'disconnect', 'deals', '--yes', '--json']);

    expect(result.code).toBe(0);
    expect(changes(dojo)).toEqual(['DELETE /api/apps/7/repo']);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({ app: 'deals', repo: null });
  });
});

describe('--help lists every flag a verb accepts', () => {
  const verbs = Object.entries(dojoCommands).flatMap(([name, command]) =>
    'verbs' in command
      ? Object.entries(command.verbs).map(([verb, spec]) => [`${name} ${verb}`, spec] as const)
      : [[name, command] as const],
  );

  it.each(verbs.filter(([, verb]) => 'raw' in verb))(
    '%s refuses a flag its help leaves out',
    async (name) => {
      const { dojo, run } = await setup();
      const result = await run([...name.split(' '), 'deals', '--not-in-help']);

      expect(result.code).toBe(2);
      expect(result.stderr()[0]).toContain("Unknown option '--not-in-help'");
      expect(dojo.requests).toEqual([]);
    },
  );

  it('apps pull lists --data', () => {
    const pull = (dojoCommands.apps as Noun).verbs.pull;

    expect(verbHelp('frogbot dojo', 'apps pull', pull).join('\n')).toContain('--data');
  });

  it("deploy's usage names every flag parseShareArgs accepts", () => {
    const usage = shareUsage;

    for (const [name, option] of Object.entries(shareOptions)) {
      const negated = 'default' in option && option.default === true;

      expect(usage).toContain(negated ? `--no-${name}` : `--${name}`);
    }

    expect(usage).toContain('--confirm <app-slug>');
  });
});

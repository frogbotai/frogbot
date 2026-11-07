import { describe, expect, it } from 'vitest';

import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

type Reply = { status?: number; body: unknown };

type Case = {
  args: string[];
  route: string;
  body?: unknown;
  search?: string;
  replies?: Record<string, Reply>;
};

const project = { id: 7, name: 'Deals', slug: 'deals', workspace: 1, startedAt: null };
const member = { id: 3, email: 'ada@example.com', role: 'member' };
const workspace = { id: 1, name: 'Trend Capital', slug: 'trend-capital' };

const cases: Case[] = [
  {
    args: ['workspaces', 'create', 'Acme'],
    route: 'POST /api/workspaces',
    body: { name: 'Acme' },
    replies: {
      'POST /api/workspaces': { status: 201, body: { doc: { ...workspace, name: 'Acme' } } },
    },
  },
  {
    args: ['workspaces', 'rename', 'trend-capital', 'Trend'],
    route: 'PATCH /api/workspaces/1',
    body: { name: 'Trend' },
    replies: { 'PATCH /api/workspaces/1': { body: { doc: { ...workspace, name: 'Trend' } } } },
  },
  {
    args: ['members', 'list'],
    route: 'GET /api/members',
    search: 'where[workspace][equals]=1',
    replies: { 'GET /api/members': { body: { docs: [member] } } },
  },
  {
    args: ['members', 'add', 'bo@example.com', '--role', 'owner'],
    route: 'POST /api/members',
    body: { workspace: 1, email: 'bo@example.com', role: 'owner' },
    replies: { 'POST /api/members': { status: 201, body: { doc: { ...member, role: 'owner' } } } },
  },
  {
    args: ['members', 'role', 'ada@example.com', 'owner'],
    route: 'PATCH /api/members/3',
    body: { role: 'owner' },
    replies: {
      'GET /api/members': { body: { docs: [member] } },
      'PATCH /api/members/3': { body: { doc: { ...member, role: 'owner' } } },
    },
  },
  {
    args: ['members', 'remove', 'ada@example.com', '--yes'],
    route: 'DELETE /api/members/3',
    replies: {
      'GET /api/members': { body: { docs: [member] } },
      'DELETE /api/members/3': { body: { doc: member } },
    },
  },
  {
    args: ['apps', 'list', '--workspace', 'trend-capital'],
    route: 'GET /api/projects',
    search: 'where[workspace][equals]=1',
    replies: { 'GET /api/projects': { body: { docs: [project] } } },
  },
  { args: ['apps', 'get', 'deals'], route: 'GET /api/apps/deals' },
  {
    args: ['apps', 'create', 'Deal Flow'],
    route: 'POST /api/projects',
    body: { name: 'Deal Flow', slug: 'deal-flow', workspace: 1 },
  },
  {
    args: ['apps', 'rename', 'deals', 'Deal Room'],
    route: 'PATCH /api/projects/7',
    body: { name: 'Deal Room' },
    replies: { 'PATCH /api/projects/7': { body: { doc: { ...project, name: 'Deal Room' } } } },
  },
  {
    args: ['apps', 'delete', 'deals', '--yes'],
    route: 'DELETE /api/projects/7',
    replies: { 'DELETE /api/projects/7': { body: { doc: project } } },
  },
  {
    args: ['deployments', 'list', 'deals'],
    route: 'GET /api/deployments',
    search: 'where[project][equals]=7',
    replies: {
      'GET /api/deployments': {
        body: { docs: [{ id: 7, status: 'ready', createdAt: '2026-11-07T00:00:00Z' }] },
      },
    },
  },
  { args: ['deployments', 'logs', '7'], route: 'GET /api/deployments/7/logs' },
  { args: ['env', 'list', 'deals'], route: 'GET /api/apps/7/keys' },
  {
    args: ['env', 'set', 'deals', 'STRIPE_KEY=sk_live_1=2', 'MODE=live'],
    route: 'PUT /api/apps/7/keys',
    body: { values: { STRIPE_KEY: 'sk_live_1=2', MODE: 'live' } },
    replies: {
      'PUT /api/apps/7/keys': { body: { changed: ['STRIPE_KEY', 'MODE'], retrying: false } },
    },
  },
  {
    args: ['env', 'unset', 'deals', 'MODE', '--yes'],
    route: 'PUT /api/apps/7/keys',
    body: { values: { MODE: null } },
    replies: { 'PUT /api/apps/7/keys': { body: { changed: ['MODE'], retrying: false } } },
  },
  {
    args: ['domains', 'get', 'deals'],
    route: 'GET /api/apps/7/domain',
    replies: { 'GET /api/apps/7/domain': { body: { domain: null, record: null, status: null } } },
  },
  {
    args: ['domains', 'set', 'deals', 'crm.acme.com'],
    route: 'PUT /api/apps/7/domain',
    body: { domain: 'crm.acme.com' },
    replies: {
      'PUT /api/apps/7/domain': {
        body: {
          domain: 'crm.acme.com',
          record: { name: 'crm.acme.com', target: 'deals.frogbot.app' },
          status: 'waiting',
        },
      },
    },
  },
  {
    args: ['domains', 'clear', 'deals'],
    route: 'PUT /api/apps/7/domain',
    body: { domain: null },
    replies: { 'PUT /api/apps/7/domain': { body: { domain: null, record: null, status: null } } },
  },
  {
    args: ['sharing', 'list', 'deals'],
    route: 'GET /api/projects/7/sharing',
    replies: {
      'GET /api/projects/7/sharing': {
        body: {
          url: 'https://deals.frogbot.app',
          shares: [{ id: 1, email: 'ada@example.com', level: 'editor', invited: true, you: false }],
        },
      },
    },
  },
  {
    args: ['sharing', 'invite', 'deals', 'ada@example.com', 'bo@example.com', '--level', 'editor'],
    route: 'POST /api/projects/7/invite',
    body: { emails: 'ada@example.com, bo@example.com', level: 'editor' },
    replies: {
      'POST /api/projects/7/invite': {
        body: { created: ['ada@example.com'], existing: ['bo@example.com'], failed: [] },
      },
    },
  },
  {
    args: ['sharing', 'leave', 'deals', '--yes'],
    route: 'DELETE /api/projects/7/sharing/me',
    replies: {
      'GET /api/projects': { body: { docs: [project] } },
      'DELETE /api/projects/7/sharing/me': { body: { removed: true } },
    },
  },
  {
    args: ['keys', 'list'],
    route: 'GET /api/api-keys',
    search: 'where[revokedAt][exists]=false',
    replies: {
      'GET /api/api-keys': {
        body: {
          docs: [
            { id: 4, name: 'CLI', prefix: 'fb_ab', canMint: true, mintedBy: null, createdAt: 'x' },
            { id: 5, name: 'CI', prefix: 'fb_cd', mintedBy: 4, createdAt: 'y' },
          ],
        },
      },
    },
  },
  {
    args: ['keys', 'create', 'ci', '--can-mint'],
    route: 'POST /api/api-keys/mint',
    body: { name: 'ci', data: { canMint: true } },
    replies: {
      'POST /api/api-keys/mint': {
        status: 201,
        body: { id: 5, name: 'ci', prefix: 'fb_cd', token: 'fb_cd_secret' },
      },
    },
  },
  { args: ['keys', 'revoke', '100', '--yes'], route: 'POST /api/api-keys/100/revoke' },
  { args: ['billing', 'status'], route: 'GET /api/workspaces/1' },
  {
    args: ['billing', 'manage'],
    route: 'POST /api/billing/portal',
    body: { workspace: '1' },
    replies: { 'POST /api/billing/portal': { body: { url: 'https://billing.stripe.com/p/1' } } },
  },
  { args: ['whoami'], route: 'GET /api/workspaces' },
];

async function setup(replies: Record<string, Reply> = {}) {
  const dojo = await startFakeDojo();
  const env = {
    XDG_CONFIG_HOME: await tempDir(),
    FROGBOT_DOJO_URL: dojo.url,
    FROGBOT_DOJO_TOKEN: 'fb_env',
  };

  dojo.tokens.set('fb_env', 100);
  dojo.level = 'owner';
  dojo.projects.push({ id: 7, name: 'Deals', slug: 'deals', workspace: 1 });
  dojo.build = { lines: ['step 1'], status: 'ready' };

  for (const [route, reply] of Object.entries(replies)) dojo.replies.set(route, reply);

  return { dojo, env, cwd: await tempDir() };
}

function sent(dojo: FakeDojo, route: string) {
  return dojo.requests.find((request) => `${request.method} ${request.path}` === route);
}

function bodyOf(request: FakeDojo['requests'][number] | undefined): unknown {
  const text = request?.body.toString();

  return text ? JSON.parse(text) : undefined;
}

function searchOf(request: FakeDojo['requests'][number] | undefined): string {
  return decodeURIComponent(request?.search ?? '');
}

describe('frogbot dojo <noun> <verb>', () => {
  it.each(cases)('$args.0 $args.1 calls $route', async ({ args, route, body, search, replies }) => {
    const { dojo, env, cwd } = await setup(replies);
    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(0);

    const request = sent(dojo, route);

    expect(request, dojo.paths().join('\n')).toBeDefined();
    expect(request?.headers.authorization).toBe('Bearer fb_env');

    expect(bodyOf(request)).toEqual(body);
    expect(searchOf(request)).toContain(search ?? '');

    expect(result.stderr()).toEqual([]);
  });

  it.each(cases)('$args.0 $args.1 --json prints one JSON value', async ({ args, replies }) => {
    const { env, cwd } = await setup(replies);
    const result = testIO({ cwd, env });

    expect(await runDojo([...args, '--json'], result.io)).toBe(0);
    expect(() => JSON.parse(result.stdout().join('\n'))).not.toThrow();
  });

  it('prints a new key once, and its JSON carries the token', async () => {
    const { env, cwd } = await setup({
      'POST /api/api-keys/mint': {
        status: 201,
        body: { id: 5, name: 'ci', prefix: 'fb_cd', token: 'fb_cd_secret' },
      },
    });

    const human = testIO({ cwd, env });

    expect(await runDojo(['keys', 'create', 'ci'], human.io)).toBe(0);
    expect(human.stdout()).toEqual([
      "[frogbot] Created ci (5). Copy it now; Dojo won't show it again:",
      'fb_cd_secret',
    ]);

    const json = testIO({ cwd, env });

    expect(await runDojo(['keys', 'create', 'ci', '--json'], json.io)).toBe(0);
    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({ token: 'fb_cd_secret' });
  });

  it('shows the CNAME record while a domain waits for DNS', async () => {
    const { env, cwd } = await setup(
      cases.find(({ route }) => route === 'PUT /api/apps/7/domain')?.replies,
    );

    const result = testIO({ cwd, env });

    expect(await runDojo(['domains', 'set', 'deals', 'crm.acme.com'], result.io)).toBe(0);
    expect(result.stdout()).toEqual([
      'crm.acme.com  waiting for DNS',
      'Add a CNAME record: crm.acme.com → deals.frogbot.app',
    ]);
  });

  it.each([
    [['env', 'set', 'deals', 'NOVALUE'], 'Write each key as KEY=value; "NOVALUE" isn\'t.'],
    [['env', 'unset', 'deals', '1BAD', '--yes'], '"1BAD" isn\'t a key name'],
    [['members', 'add', 'bo@example.com', '--role', 'admin'], 'Choose a role: owner or member.'],
    [
      ['sharing', 'invite', 'deals', 'a@b.co', '--level', 'admin'],
      'Choose a level: use, editor, owner.',
    ],
    [['apps', 'get'], 'Usage: frogbot apps get <app> [--json]'],
    [['apps', 'get', 'deals', '--nope'], "Unknown option '--nope'"],
  ])('exits 2 before calling Dojo for %j', async (args, message) => {
    const { dojo, env, cwd } = await setup();
    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(2);
    expect(result.stderr()[0]).toContain(message);
    expect(dojo.requests.filter(({ path }) => path !== '/api/apps/deals')).toEqual([]);
  });
});

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

const app = { id: 7, name: 'Deals', slug: 'deals', workspace: 1, startedAt: null };
const member = { id: 3, email: 'ada@example.com', role: 'member' };
const workspace = { id: 1, name: 'Trend Capital', slug: 'trend-capital' };
const project = { id: 'p1', name: 'Deals', workspace: 1, isDefault: false };
const projectList = { 'GET /api/projects': { body: { docs: [project] } } };
const danger = {
  kind: 'project',
  name: 'Deals',
  canManage: true,
  canLeave: true,
  onlyAdmin: false,
  hasApps: true,
  workspace: { id: 1, name: 'Trend Capital' },
  targets: [{ id: 2, name: 'Acme' }],
  handover: { id: 'h1', email: 'bo@example.com', expiresAt: '2026-11-29T00:00:00Z' },
};

const acme = { id: 2, name: 'Acme', slug: 'acme' };
const twoWorkspaces = { 'GET /api/workspaces': { body: { docs: [workspace, acme] } } };
const sentHandover = {
  body: {
    handover: { id: 'h1', email: 'bo@example.com', expiresAt: '2026-11-29T00:00:00Z' },
    sent: true,
  },
};

const handover = {
  id: 'h1',
  kind: 'app',
  name: 'Deals',
  sender: 'Ada',
  fromWorkspace: 'Trend Capital',
  email: 'bo@example.com',
  expiresAt: '2026-11-29T00:00:00Z',
  status: 'pending',
  recipient: true,
  workspaces: [{ id: 2, name: 'Acme' }],
  toWorkspace: null,
  people: [{ email: 'ada@example.com', level: 'owner' }],
  canRemove: false,
};

const accepted = {
  ...handover,
  status: 'accepted',
  recipient: false,
  workspaces: [],
  toWorkspace: 'Acme',
  canRemove: true,
};

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
    args: ['workspaces', 'delete', 'trend-capital', '--yes'],
    route: 'POST /api/workspaces/1/delete',
    body: { name: 'Trend Capital' },
    replies: { 'POST /api/workspaces/1/delete': { body: { deleted: true } } },
  },
  {
    args: ['workspaces', 'owner', 'trend-capital', 'ADA@example.com', '--yes'],
    route: 'POST /api/workspaces/1/owner',
    body: { memberId: 3 },
    replies: {
      'GET /api/members': { body: { docs: [member] } },
      'POST /api/workspaces/1/owner': { body: { owner: 3, previous: 1 } },
    },
  },
  {
    args: ['projects', 'list', '--workspace', 'trend-capital'],
    route: 'GET /api/projects',
    search: 'where[workspace][equals]=1',
    replies: projectList,
  },
  {
    args: ['projects', 'create', 'Deals'],
    route: 'POST /api/projects',
    body: { workspace: 1, name: 'Deals' },
    replies: { 'POST /api/projects': { status: 201, body: { doc: project } } },
  },
  {
    args: ['projects', 'rename', 'deals', 'Deal Room'],
    route: 'PATCH /api/projects/p1',
    body: { name: 'Deal Room' },
    replies: {
      ...projectList,
      'PATCH /api/projects/p1': { body: { doc: { ...project, name: 'Deal Room' } } },
    },
  },
  {
    args: ['projects', 'delete', 'p1', '--yes'],
    route: 'DELETE /api/projects/p1',
    replies: { ...projectList, 'DELETE /api/projects/p1': { body: { doc: project } } },
  },
  {
    args: ['projects', 'danger', 'Deals'],
    route: 'GET /api/projects/p1/danger',
    replies: { ...projectList, 'GET /api/projects/p1/danger': { body: danger } },
  },
  {
    args: ['projects', 'move', 'Deals', '--workspace', 'acme', '--yes'],
    route: 'POST /api/projects/p1/move',
    body: { workspace: 2 },
    replies: {
      ...projectList,
      ...twoWorkspaces,
      'POST /api/projects/p1/move': { body: { moved: [7] } },
    },
  },
  {
    args: ['projects', 'handover', 'Deals', '--to', 'bo@example.com', '--yes'],
    route: 'POST /api/projects/p1/handover',
    body: { email: 'bo@example.com' },
    replies: { ...projectList, 'POST /api/projects/p1/handover': sentHandover },
  },
  {
    args: ['apps', 'move', 'deals', '--workspace', 'acme', '--yes'],
    route: 'POST /api/apps/7/move',
    body: { workspace: 2 },
    replies: { ...twoWorkspaces, 'POST /api/apps/7/move': { body: { moved: [7] } } },
  },
  {
    args: ['apps', 'move', 'deals', '--project', 'deals', '--yes'],
    route: 'PATCH /api/apps/7',
    body: { project: 'p1' },
    replies: { ...projectList, 'PATCH /api/apps/7': { body: { doc: app } } },
  },
  {
    args: ['apps', 'handover', 'deals', '--to', 'bo@example.com', '--yes'],
    route: 'POST /api/apps/7/handover',
    body: { email: 'bo@example.com' },
    replies: { 'POST /api/apps/7/handover': sentHandover },
  },
  {
    args: ['handovers', 'details', 'https://dojo.example/admin/handover/h1?from=email'],
    route: 'GET /api/handovers/h1/details',
    replies: { 'GET /api/handovers/h1/details': { body: handover } },
  },
  {
    args: ['handovers', 'accept', 'h1', '--yes'],
    route: 'POST /api/handovers/h1/accept',
    body: { workspace: 2 },
    replies: {
      ...twoWorkspaces,
      'GET /api/handovers/h1/details': { body: handover },
      'POST /api/handovers/h1/accept': { body: { moved: [7] } },
    },
  },
  {
    args: ['handovers', 'accept', 'h1', '--workspace', 'acme', '--yes'],
    route: 'POST /api/handovers/h1/accept',
    body: { workspace: 2 },
    replies: {
      ...twoWorkspaces,
      'GET /api/handovers/h1/details': { body: handover },
      'POST /api/handovers/h1/accept': { body: { moved: [7] } },
    },
  },
  {
    args: ['handovers', 'cancel', 'h1'],
    route: 'POST /api/handovers/h1/cancel',
    replies: { 'POST /api/handovers/h1/cancel': { body: { cancelled: true } } },
  },
  {
    args: ['handovers', 'remove-access', 'h1', '--yes'],
    route: 'POST /api/handovers/h1/remove-access',
    replies: {
      'GET /api/handovers/h1/details': { body: accepted },
      'POST /api/handovers/h1/remove-access': { body: { removed: 1 } },
    },
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
    route: 'GET /api/apps',
    search: 'where[workspace][equals]=1',
    replies: { 'GET /api/apps': { body: { docs: [app] } } },
  },
  { args: ['apps', 'get', 'deals'], route: 'GET /api/apps/deals/cli' },
  {
    args: ['apps', 'create', 'Deal Flow'],
    route: 'POST /api/apps',
    body: { name: 'Deal Flow', slug: 'deal-flow', workspace: 1 },
  },
  {
    args: ['apps', 'rename', 'deals', 'Deal Room'],
    route: 'PATCH /api/apps/7',
    body: { name: 'Deal Room' },
    replies: { 'PATCH /api/apps/7': { body: { doc: { ...app, name: 'Deal Room' } } } },
  },
  {
    args: ['apps', 'delete', 'deals', '--yes'],
    route: 'POST /api/apps/7/trash',
    replies: {
      'POST /api/apps/7/trash': {
        body: { deletedAt: '2026-11-15T00:00:00Z', purgeAt: '2026-12-15T00:00:00Z' },
      },
    },
  },
  {
    args: ['deployments', 'list', 'deals'],
    route: 'GET /api/deployments',
    search: 'where[app][equals]=7',
    replies: {
      'GET /api/deployments': {
        body: { docs: [{ id: 7, status: 'ready', createdAt: '2026-11-07T00:00:00Z' }] },
      },
    },
  },
  { args: ['deployments', 'logs', '7', '--follow'], route: 'GET /api/deployments/7/logs' },
  {
    args: ['deployments', 'logs', '7'],
    route: 'GET /api/deployments/7',
    replies: {
      'GET /api/deployments/7': {
        body: {
          id: 7,
          status: 'failed',
          error: 'Build failed',
          logTail: ['step 1'],
          createdAt: 'x',
        },
      },
    },
  },
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
      'GET /api/apps/7/domain': { body: { domain: null, record: null, status: null } },
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
    args: ['domains', 'clear', 'deals', '--yes'],
    route: 'PUT /api/apps/7/domain',
    body: { domain: null },
    replies: { 'PUT /api/apps/7/domain': { body: { domain: null, record: null, status: null } } },
  },
  {
    args: ['sharing', 'list', 'deals'],
    route: 'GET /api/apps/7/sharing',
    replies: {
      'GET /api/apps/7/sharing': {
        body: {
          url: 'https://deals.frogbot.app',
          shares: [{ id: 1, email: 'ada@example.com', level: 'editor', invited: true, you: false }],
        },
      },
    },
  },
  {
    args: ['sharing', 'invite', 'deals', 'ada@example.com', 'bo@example.com', '--level', 'editor'],
    route: 'POST /api/apps/7/invite',
    body: { emails: 'ada@example.com, bo@example.com', level: 'editor' },
    replies: {
      'POST /api/apps/7/invite': {
        body: { created: ['ada@example.com'], existing: ['bo@example.com'], failed: [] },
      },
    },
  },
  {
    args: ['sharing', 'leave', 'deals', '--yes'],
    route: 'DELETE /api/apps/7/sharing/me',
    replies: {
      'GET /api/apps': { body: { docs: [app] } },
      'DELETE /api/apps/7/sharing/me': { body: { removed: true } },
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
  { args: ['keys', 'revoke', '100', '--cascade', '--yes'], route: 'POST /api/api-keys/100/revoke' },
  {
    args: ['keys', 'revoke', '100', '--no-cascade', '--yes'],
    route: 'POST /api/api-keys/100/revoke',
    body: { cascade: false },
  },
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
  dojo.apps.push({ id: 7, name: 'Deals', slug: 'deals', workspace: 1 });
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

  it('runs a command whose argument is the word help', async () => {
    const { dojo, env, cwd } = await setup({
      'POST /api/workspaces': { status: 201, body: { doc: { ...workspace, name: 'help' } } },
    });

    expect(await runDojo(['workspaces', 'create', 'help'], testIO({ cwd, env }).io)).toBe(0);
    expect(dojo.paths()).toContain('POST /api/workspaces');
  });

  it('links to the upgrade page when the plan is none', async () => {
    const { dojo, env, cwd } = await setup({
      'GET /api/workspaces/1': { body: { ...workspace, plan: 'none', paidApps: 0 } },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['billing', 'status'], result.io)).toBe(0);
    expect(result.stdout()).toEqual([
      'trend-capital: no plan, 0 paid apps',
      `Choose a plan at ${dojo.url}/billing/upgrade?workspace=1`,
    ]);
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
    [['apps', 'get'], 'Run this in a folder you deployed with frogbot deploy, or name the app.'],
    [['apps', 'get', 'deals', '--nope'], "Unknown option '--nope'"],
    [['apps', 'create', '2024'], '"2024" would make the slug "2024", which reads as an app id.'],
    [['apps', 'get', '..'], '".." can\'t name anything on Dojo.'],
    [['keys', 'revoke', '..', '--yes'], '".." can\'t name anything on Dojo.'],
    [['keys', 'revoke', '.', '--yes'], '"." can\'t name anything on Dojo.'],
    [
      ['keys', 'revoke', '5', '--cascade', '--no-cascade', '--yes'],
      'Pass --cascade or --no-cascade, not both.',
    ],
    [['deployments', 'logs', '..'], '".." can\'t name anything on Dojo.'],
    [['apps', 'move', 'deals', '--yes'], 'Pass --workspace <slug> or --project <project>'],
    [
      ['apps', 'move', 'deals', '--workspace', 'acme', '--project', 'Ops', '--yes'],
      'Pass --workspace <slug> or --project <project>',
    ],
    [['apps', 'handover', 'deals', '--yes'], 'Name who it goes to with --to <email>.'],
    [['apps', 'handover', 'deals', '--to', ' ', '--yes'], 'Name who it goes to with --to <email>.'],
    [['projects', 'move', 'Deals', '--yes'], 'Name the workspace it moves into with --workspace'],
    [['projects', 'handover', 'Deals', '--yes'], 'Name who it goes to with --to <email>.'],
    [
      ['handovers', 'cancel', 'https://dojo.example/admin/handover/..'],
      '".." can\'t name anything on Dojo.',
    ],
    [['deployments', 'logs', '..', '--follow'], '".." can\'t name anything on Dojo.'],
  ])('exits 2 before calling Dojo for %j', async (args, message) => {
    const { dojo, env, cwd } = await setup();
    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(2);
    expect(result.stderr()[0]).toContain(message);
    expect(dojo.requests.filter(({ path }) => path !== '/api/apps/deals/cli')).toEqual([]);
  });

  it('names the taken app when Dojo answers name_taken in errors[].data.code', async () => {
    const { dojo, env, cwd } = await setup();
    const result = testIO({ cwd, env });

    dojo.createReply = {
      status: 409,
      body: {
        errors: [
          { name: 'APIError', message: 'That name is taken.', data: { code: 'name_taken' } },
        ],
      },
    };

    expect(await runDojo(['apps', 'create', 'Deal Flow'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] The name "deal-flow" is taken on Dojo. Choose another.',
    ]);
  });

  it('refuses --cascade with --no-cascade before asking to confirm', async () => {
    const { dojo, env, cwd } = await setup();
    const result = testIO({ cwd, env, isTTY: true, confirm: true });

    expect(await runDojo(['keys', 'revoke', '5', '--cascade', '--no-cascade'], result.io)).toBe(2);
    expect(result.stderr()[0]).toContain('Pass --cascade or --no-cascade, not both.');
    expect(result.asked).toEqual([]);
    expect(dojo.requests).toEqual([]);
  });

  it.each([
    [['apps', 'get', 'a/b?c'], 'GET /api/apps/a%2Fb%3Fc/cli'],
    [['deployments', 'logs', '7?x=1', '--follow'], 'GET /api/deployments/7%3Fx%3D1/logs'],
    [
      ['deployments', 'logs', '../projects/7', '--follow'],
      'GET /api/deployments/..%2Fprojects%2F7/logs',
    ],
  ])('keeps %j inside its route', async (args, route) => {
    const { dojo, env, cwd } = await setup();

    await runDojo(args, testIO({ cwd, env }).io);

    expect(dojo.paths()).toEqual([route]);
    expect(dojo.requests.map(({ search }) => search)).toEqual(['']);
  });

  it("refuses digits that are one app's id and another app's slug", async () => {
    const { dojo, env, cwd } = await setup();

    dojo.apps.push({ id: 2024, name: 'Production', slug: 'prod', workspace: 1 });
    dojo.apps.push({ id: 9, name: '2024', slug: '2024', workspace: 1 });

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'delete', '2024', '--yes'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] "2024" is the id of prod and the slug of another app. Name that app by its id.',
    ]);
    expect(dojo.paths().filter((route) => !route.startsWith('GET '))).toEqual([]);
  });

  it("shows a project's Danger zone in words, and the same facts as JSON", async () => {
    const replies = { ...projectList, 'GET /api/projects/p1/danger': { body: danger } };
    const { env, cwd } = await setup(replies);
    const human = testIO({ cwd, env });

    expect(await runDojo(['projects', 'danger', 'deals'], human.io)).toBe(0);
    expect(human.stdout()).toEqual([
      'Deals  in Trend Capital',
      'Move, hand over, delete: yes',
      'Leave: yes',
      'Delete waits until it has no apps, Trash included.',
      'Can move to: Acme',
      'Handover to bo@example.com waits until 2026-11-29T00:00:00Z (h1)',
    ]);

    const json = testIO({ cwd, env });

    expect(await runDojo(['projects', 'danger', 'deals', '--json'], json.io)).toBe(0);
    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({
      id: 'p1',
      hasApps: true,
      handover: { id: 'h1' },
    });
  });

  it('lists projects with their ids, and JSON carries the same ids', async () => {
    const other = { ...project, id: 'p0', name: 'General', isDefault: true };
    const { env, cwd } = await setup({ 'GET /api/projects': { body: { docs: [other, project] } } });
    const human = testIO({ cwd, env });

    expect(await runDojo(['projects', 'list'], human.io)).toBe(0);
    expect(human.stdout()).toEqual(['p0  General  (default)', 'p1  Deals']);

    const json = testIO({ cwd, env });

    expect(await runDojo(['projects', 'list', '--json'], json.io)).toBe(0);
    expect(JSON.parse(json.stdout().join('\n'))).toEqual([
      { id: 'p0', name: 'General', workspace: 1, isDefault: true },
      { id: 'p1', name: 'Deals', workspace: 1, isDefault: false },
    ]);
  });

  it('refuses a project name two projects share, naming their ids', async () => {
    const twin = { ...project, id: 'p2', workspace: 2 };
    const { dojo, env, cwd } = await setup({
      'GET /api/projects': { body: { docs: [project, twin] } },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['projects', 'delete', 'Deals', '--yes'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] "Deals" names 2 projects (p1, p2). Name one by its id.',
    ]);
    expect(dojo.paths().filter((route) => !route.startsWith('GET '))).toEqual([]);
  });

  it("prints Dojo's reason and exits 1 when a project still holds apps", async () => {
    const { env, cwd } = await setup({
      ...projectList,
      'DELETE /api/projects/p1': {
        status: 409,
        body: { errors: [{ message: 'Move or delete its apps first, Trash included.' }] },
      },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['projects', 'delete', 'Deals', '--yes'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Dojo couldn't delete Deals: Move or delete its apps first, Trash included.",
    ]);
  });

  it('names the Owner a workspace delete needs on a 403', async () => {
    const { env, cwd } = await setup({
      'POST /api/workspaces/1/delete': {
        status: 403,
        body: { errors: [{ message: 'Only the workspace Owner can delete it.' }] },
      },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['workspaces', 'delete', 'trend-capital', '--yes'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Dojo couldn't delete trend-capital: Only the workspace Owner can delete it. It needs the workspace's Owner.",
    ]);
  });

  it.each([
    [
      ['workspaces', 'delete', 'nope', '--yes'],
      'No workspace "nope" in Dojo. Yours: trend-capital.',
    ],
    [['workspaces', 'owner', 'nope', 'ada@example.com', '--yes'], 'No workspace "nope" in Dojo.'],
    [
      ['workspaces', 'owner', 'trend-capital', 'zed@example.com', '--yes'],
      "zed@example.com isn't a member of trend-capital.",
    ],
    [['projects', 'rename', 'nope', 'X'], 'No project "nope". projects list shows yours.'],
  ])('fails %j before changing anything', async (args, message) => {
    const { dojo, env, cwd } = await setup({
      ...projectList,
      'GET /api/members': { body: { docs: [member] } },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(1);
    expect(result.stderr()[0]).toContain(message);
    expect(dojo.paths().filter((route) => !route.startsWith('GET '))).toEqual([]);
  });

  it.each([
    [['workspaces', 'delete', '', '--yes'], "<slug> can't be blank."],
    [['workspaces', 'owner', ' ', 'ada@example.com', '--yes'], "<slug> can't be blank."],
    [['workspaces', 'owner', 'trend-capital', '', '--yes'], "<email> can't be blank."],
    [['projects', 'delete', '', '--yes'], "<project> can't be blank."],
  ])('refuses a blank argument in %j, as an unset shell variable gives', async (args, message) => {
    const { dojo, env, cwd } = await setup({ 'GET /api/members': { body: { docs: [member] } } });
    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(2);
    expect(result.stderr()[0]).toContain(message);
    expect(dojo.requests).toEqual([]);
  });

  it("prints Dojo's Business-features refusal without blaming access", async () => {
    const { env, cwd } = await setup({
      'POST /api/projects': {
        status: 403,
        body: {
          errors: [{ message: 'Adding projects needs Business features on the workspace.' }],
        },
      },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['projects', 'create', 'Deals'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Dojo couldn't create the project in trend-capital: Adding projects needs Business features on the workspace.",
    ]);
  });

  it.each([
    ['apps', '/api/apps'],
    ['keys', '/api/api-keys'],
    ['members', '/api/members'],
    ['projects', '/api/projects'],
    ['workspaces', '/api/workspaces'],
  ])('%s list reads every page', async (noun, route) => {
    const { dojo, env, cwd } = await setup();
    const served = () => dojo.requests.filter(({ path }) => path === route);

    const page = (n: number) => ({
      body: {
        docs: [{ ...app, ...member, ...workspace, id: n, slug: `s${n}`, createdAt: 'x' }],
        hasNextPage: n < 3,
      },
    });

    dojo.replies.set(`GET ${route}`, page(1));
    dojo.afterRequest = () => dojo.replies.set(`GET ${route}`, page(served().length + 1));

    const result = testIO({ cwd, env });

    expect(await runDojo([noun, 'list', '--json'], result.io)).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toHaveLength(3);
    expect(served().map(({ search }) => new URLSearchParams(search).get('page'))).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});

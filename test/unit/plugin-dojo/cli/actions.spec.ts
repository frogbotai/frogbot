import { writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

const trashed = {
  id: 8,
  name: 'Old CRM',
  slug: 'old-crm',
  workspace: '1',
  deletedAt: '2026-11-10T00:00:00Z',
  purgeAt: '2026-12-10T00:00:00Z',
};

const template = { id: 'tpl1', name: 'Helpdesk', summary: 'Tickets and replies', tags: [] };

const usage = {
  month: '2026-11',
  spentUSD: 3.2,
  days: [],
  models: [{ model: 'openai/gpt-5.4-mini', requests: 12, costUSD: 3.2 }],
  workspace: '1',
  metered: true,
  balanceUSD: 16.8,
  paused: false,
  canManageFunds: true,
  autoRecharge: false,
  hasSavedCard: false,
  process: null,
};

const preview = { state: 'live', startedAt: 'x', endsAt: 'y', deleteAt: null, keep: true };
const upgrade = (dojo: FakeDojo) => `${dojo.url}/billing/upgrade?workspace=1&apps=2`;

const cases: Case[] = [
  {
    args: ['apps', 'restart', 'deals'],
    route: 'POST /api/apps/7/restart',
    replies: { 'POST /api/apps/7/restart': { body: { restarted: true } } },
  },
  {
    args: ['apps', 'stop', 'deals', '--yes'],
    route: 'POST /api/apps/7/stop',
    replies: { 'POST /api/apps/7/stop': { body: { stopped: true, stoppedAt: 'x' } } },
  },
  {
    args: ['apps', 'start', 'deals'],
    route: 'POST /api/apps/7/start',
    replies: { 'POST /api/apps/7/start': { body: { stopped: false, stoppedAt: null } } },
  },
  {
    args: ['apps', 'keep', 'deals'],
    route: 'POST /api/apps/7/preview/keep',
    replies: { 'POST /api/apps/7/preview/keep': { body: { preview: null, url: null } } },
  },
  {
    args: ['apps', 'usage', 'deals'],
    route: 'GET /api/apps/7/usage',
    replies: { 'GET /api/apps/7/usage': { body: usage } },
  },
  {
    args: ['apps', 'trash'],
    route: 'GET /api/trash',
    replies: { 'GET /api/trash': { body: { apps: [trashed] } } },
  },
  {
    args: ['apps', 'restore', 'old-crm'],
    route: 'POST /api/apps/8/restore',
    replies: {
      'GET /api/trash': { body: { apps: [trashed] } },
      'POST /api/apps/8/restore': { body: { restored: true } },
    },
  },
  {
    args: ['apps', 'create', 'Acme Desk', '--template', 'helpdesk'],
    route: 'POST /api/templates/tpl1/use',
    body: { name: 'Acme Desk', slug: 'acme-desk', workspace: 1 },
    replies: {
      'GET /api/templates': { body: { docs: [template] } },
      'POST /api/templates/tpl1/use': {
        status: 201,
        body: { app: { id: 9, slug: 'acme-desk', name: 'Acme Desk' }, deploymentId: 40 },
      },
    },
  },
  {
    args: ['templates', 'list'],
    route: 'GET /api/templates',
    search: 'sort=name',
    replies: { 'GET /api/templates': { body: { docs: [template] } } },
  },
  {
    args: ['deployments', 'rollback', 'deals', '30'],
    route: 'POST /api/apps/7/deployments/30/rollback',
    replies: {
      'POST /api/apps/7/deployments/30/rollback': { status: 201, body: { deploymentId: 41 } },
    },
  },
  {
    args: ['deployments', 'cancel', '41'],
    route: 'POST /api/deployments/41/cancel',
    replies: {
      'POST /api/deployments/41/cancel': { body: { status: 'cancelled', finishedAt: 'x' } },
    },
  },
  {
    args: ['billing', 'ai'],
    route: 'GET /api/workspaces/1',
    replies: {
      'GET /api/workspaces/1': {
        body: { id: 1, slug: 'trend-capital', aiBalanceUSD: 4.5, aiAutoRecharge: true },
      },
    },
  },
  {
    args: ['billing', 'add-funds', '--amount', '50'],
    route: 'POST /api/billing/ai-checkout',
    body: { workspace: '1', amount: 50 },
    replies: { 'POST /api/billing/ai-checkout': { body: { url: 'https://checkout.stripe/1' } } },
  },
  {
    args: ['activity', '--app', 'deals', '--limit', '10'],
    route: 'GET /api/activity',
    search: 'limit=10&sort=-timestamp&where[workspace][equals]=1&where[app][equals]=7',
    replies: {
      'GET /api/activity': {
        body: {
          docs: [
            {
              id: 1,
              timestamp: '2026-11-15T10:00:00Z',
              event: 'deploy.live',
              actorLabel: 'Ada',
              appName: 'Deals',
            },
          ],
        },
      },
    },
  },
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

  for (const [route, reply] of Object.entries(replies)) dojo.replies.set(route, reply);

  return { dojo, env, cwd: await tempDir() };
}

function sent(dojo: FakeDojo, route: string) {
  return dojo.requests.find((request) => `${request.method} ${request.path}` === route);
}

describe('frogbot dojo actions beyond the basics', () => {
  it.each(cases)('$args.0 $args.1 calls $route', async ({ args, route, body, search, replies }) => {
    const { dojo, env, cwd } = await setup(replies);
    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(0);

    const request = sent(dojo, route);

    expect(request, dojo.paths().join('\n')).toBeDefined();
    expect(request?.headers.authorization).toBe('Bearer fb_env');

    const text = request?.body.toString();

    expect(text ? JSON.parse(text) : undefined).toEqual(body);
    expect(decodeURIComponent(request?.search ?? '')).toContain(search ?? '');
    expect(result.stderr()).toEqual([]);
  });

  it.each(cases)('$args.0 $args.1 --json prints one JSON value', async ({ args, replies }) => {
    const { env, cwd } = await setup(replies);
    const result = testIO({ cwd, env });

    expect(await runDojo([...args, '--json'], result.io)).toBe(0);
    expect(() => JSON.parse(result.stdout().join('\n'))).not.toThrow();
  });

  it("prints an app's AI spend by model and the workspace's balance", async () => {
    const { env, cwd } = await setup({ 'GET /api/apps/7/usage': { body: usage } });
    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'usage', 'deals'], result.io)).toBe(0);
    expect(result.stdout()).toEqual([
      'deals: $3.20 of AI in 2026-11',
      '  openai/gpt-5.4-mini  12 requests  $3.20',
      'Workspace AI balance: $16.80',
    ]);
  });

  it("shows a $0 balance without calling AI paused, since Dojo doesn't bill every workspace for AI", async () => {
    const reply = {
      body: { id: 1, slug: 'trend-capital', aiBalanceUSD: 0, aiAutoRecharge: false },
    };
    const { env, cwd } = await setup({ 'GET /api/workspaces/1': reply });
    const text = testIO({ cwd, env });

    expect(await runDojo(['billing', 'ai'], text.io)).toBe(0);
    expect(text.stdout()).toEqual(['trend-capital: $0.00 AI balance, auto-recharge off']);

    const json = testIO({ cwd, env });

    expect(await runDojo(['billing', 'ai', '--json'], json.io)).toBe(0);
    expect(JSON.parse(json.stdout().join('\n'))).toEqual({
      workspace: 'trend-capital',
      balanceUSD: 0,
      autoRecharge: false,
    });
  });

  it('says the AI balance is not reported when Dojo sends none', async () => {
    const reply = { body: { id: 1, slug: 'trend-capital' } };
    const { env, cwd } = await setup({ 'GET /api/workspaces/1': reply });
    const text = testIO({ cwd, env });

    expect(await runDojo(['billing', 'ai'], text.io)).toBe(0);
    expect(text.stdout()).toEqual(['trend-capital: AI balance not reported, auto-recharge off']);

    const json = testIO({ cwd, env });

    expect(await runDojo(['billing', 'ai', '--json'], json.io)).toBe(0);
    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({ balanceUSD: null });
  });

  it('exits 4 with the pay link when keeping a preview needs a paid app nobody is here to buy', async () => {
    const { dojo, env, cwd } = await setup();

    dojo.replies.set('POST /api/apps/7/preview/keep', { body: { preview, url: upgrade(dojo) } });

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'keep', 'deals', '--json'], result.io)).toBe(4);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'payment_required',
      needs: 'payment',
      link: upgrade(dojo),
    });
  });

  it("exits 4 with Dojo's data.url when restoring needs a paid app", async () => {
    const { dojo, env, cwd } = await setup({ 'GET /api/trash': { body: { apps: [trashed] } } });

    dojo.replies.set('POST /api/apps/8/restore', {
      status: 402,
      body: {
        errors: [
          { message: 'Restoring old-crm needs one more paid app.', data: { url: upgrade(dojo) } },
        ],
      },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'restore', 'old-crm'], result.io)).toBe(4);
    expect(result.stderr()).toEqual([
      `[frogbot] Restoring old-crm needs one more paid app. Pay for it at ${upgrade(dojo)}, then run the command again. Add --wait to wait for the payment here.`,
    ]);
  });

  it("refuses to restore an app that isn't in Trash, before calling restore", async () => {
    const { dojo, env, cwd } = await setup({ 'GET /api/trash': { body: { apps: [] } } });
    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'restore', 'deals'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      `[frogbot] "deals" isn't in your Trash. frogbot dojo apps trash lists it.`,
    ]);
    expect(dojo.paths()).toEqual(['GET /api/trash']);
  });

  it("saves an app's data to a new file, and never over an existing one", async () => {
    const { dojo, env, cwd } = await setup();

    dojo.dataZip = Buffer.from('PK zip bytes');

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'export-data', 'deals'], result.io)).toBe(0);
    expect(await readFile(join(cwd, 'deals-data.zip'), 'utf8')).toBe('PK zip bytes');

    await writeFile(join(cwd, 'taken.zip'), 'mine');

    const again = testIO({ cwd, env });

    expect(await runDojo(['apps', 'export-data', 'deals', '--out', 'taken.zip'], again.io)).toBe(1);
    expect(again.stderr()[0]).toContain('taken.zip already exists');
    expect(await readFile(join(cwd, 'taken.zip'), 'utf8')).toBe('mine');
  });

  it('leaves a file that appears at the path while Dojo starts the download', async () => {
    const { dojo, env, cwd } = await setup();

    dojo.dataZip = Buffer.from('PK zip bytes');

    dojo.afterRequest = (route) => {
      if (route === 'GET /api/apps/7/data') writeFileSync(join(cwd, 'deals-data.zip'), 'mine');
    };

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'export-data', 'deals'], result.io)).toBe(1);
    expect(await readFile(join(cwd, 'deals-data.zip'), 'utf8')).toBe('mine');
  });

  it("tells someone who isn't an owner to ask one, from Dojo's own wording", async () => {
    const { dojo, env, cwd } = await setup({
      'GET /api/templates': { body: { docs: [template] } },
    });
    const link = `${dojo.url}/billing/upgrade?workspace=1&apps=1`;

    dojo.replies.set('POST /api/templates/tpl1/use', {
      status: 402,
      body: {
        errors: [
          {
            message: `This workspace has no plan yet. Each app is $20 a month on Pro or $40 on Business. Ask the workspace's Owner to open ${link}, then use the template again.`,
            data: { url: link },
          },
        ],
      },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'create', 'Desk', '--template', 'tpl1'], result.io)).toBe(4);
    expect(result.stderr()).toEqual([
      `[frogbot] This workspace has no plan yet. Each app is $20 a month on Pro or $40 on Business. Ask a workspace owner to pay for it at ${link}, then run the command again. Add --wait to wait for the payment here.`,
    ]);
  });

  it('refuses a template name two templates share', async () => {
    const { dojo, env, cwd } = await setup({
      'GET /api/templates': { body: { docs: [template, { ...template, id: 'tpl2' }] } },
    });

    const result = testIO({ cwd, env });

    expect(await runDojo(['apps', 'create', 'Desk', '--template', 'Helpdesk'], result.io)).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] 2 templates are named "Helpdesk". Name one by its id: tpl1, tpl2.',
    ]);
    expect(dojo.paths().filter((route) => route.startsWith('POST'))).toEqual([]);
  });

  it.each([
    [['apps', 'stop', 'deals'], 'rerun with --yes'],
    [['deployments', 'rollback', 'deals'], 'Usage: frogbot deployments rollback <app> <id>'],
    [
      ['billing', 'add-funds', '--amount', '12.5'],
      'Give --amount as whole dollars from 10 to 1000',
    ],
    [['billing', 'add-funds', '--amount', '5'], 'Give --amount as whole dollars from 10 to 1000'],
    [['activity', '--limit', '500'], 'Give --limit as a whole number from 1 to 100.'],
  ])('exits 2 before calling Dojo for %j', async (args, message) => {
    const { dojo, env, cwd } = await setup();
    const result = testIO({ cwd, env });

    expect(await runDojo(args, result.io)).toBe(2);
    expect(result.stderr()[0]).toContain(message);
    expect(dojo.requests).toEqual([]);
  });
});

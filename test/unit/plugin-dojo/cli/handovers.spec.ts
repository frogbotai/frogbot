import { describe, expect, it } from 'vitest';

import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import { handoverId } from '../../../../packages/plugins/plugin-dojo/src/cli/nouns/handovers.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

const trend = { id: 1, name: 'Trend Capital', slug: 'trend-capital' };
const acme = { id: 2, name: 'Acme', slug: 'acme' };
const labs = { id: 3, name: 'Labs', slug: 'labs' };

const pending = {
  id: 'h1',
  kind: 'project',
  name: 'Ops',
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

type Options = { isTTY?: boolean; confirm?: boolean; select?: string };

async function setup(replies: Record<string, { status?: number; body: unknown }> = {}) {
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
  dojo.replies.set('GET /api/workspaces', { body: { docs: [trend, acme, labs] } });

  for (const [route, reply] of Object.entries(replies)) dojo.replies.set(route, reply);

  const run = async (args: string[], options: Options = {}) => {
    const result = testIO({ cwd, env, ...options });

    return { code: await runDojo(args, result.io), ...result };
  };

  return { dojo, run };
}

const changes = (dojo: FakeDojo) => dojo.paths().filter((route) => !route.startsWith('GET '));

const bodyOf = (dojo: FakeDojo, route: string): unknown => {
  const request = dojo.requests.find((each) => `${each.method} ${each.path}` === route);

  return request ? JSON.parse(request.body.toString()) : undefined;
};

describe('handoverId', () => {
  it.each([
    ['h1', 'h1'],
    [' h1 ', 'h1'],
    ['https://dojo.frogbot.ai/admin/handover/h1', 'h1'],
    ['https://dojo.frogbot.ai/admin/handover/h1/?utm=mail#top', 'h1'],
  ])('reads %j as %j', (ref, id) => {
    expect(handoverId(ref)).toBe(id);
  });
});

describe('handovers accept', () => {
  it('asks naming what moves, from whom, and where, then sends that workspace', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': { body: pending },
      'POST /api/handovers/h1/accept': { body: { moved: [7, 8] } },
    });

    const result = await run(['handovers', 'accept', 'h1'], { isTTY: true, confirm: true });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([
      'Accept the project Ops from Ada into Acme (acme)? You become its Admin, and Acme pays for it from then on.',
    ]);
    expect(bodyOf(dojo, 'POST /api/handovers/h1/accept')).toEqual({ workspace: 2 });
    expect(result.stdout()).toEqual([
      '[frogbot] Accepted the project Ops into acme: 2 apps moved.',
    ]);
  });

  it('trims --workspace, as the move verbs do', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': { body: pending },
      'POST /api/handovers/h1/accept': { body: { moved: [7] } },
    });

    expect((await run(['handovers', 'accept', 'h1', '--workspace', ' acme ', '--yes'])).code).toBe(
      0,
    );
    expect(bodyOf(dojo, 'POST /api/handovers/h1/accept')).toEqual({ workspace: 2 });
  });

  it('without a terminal and with two workspaces to choose, names them and sends nothing', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': {
        body: { ...pending, workspaces: [acme, labs].map(({ id, name }) => ({ id, name })) },
      },
    });

    const result = await run(['handovers', 'accept', 'h1', '--yes']);

    expect(result.code).toBe(2);
    expect(result.stderr()).toEqual([
      '[frogbot] Choose where it goes (acme, labs), then rerun with --workspace <slug>.',
    ]);
    expect(changes(dojo)).toEqual([]);
  });

  it('with a terminal and two workspaces, asks which', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': {
        body: { ...pending, workspaces: [acme, labs].map(({ id, name }) => ({ id, name })) },
      },
      'POST /api/handovers/h1/accept': { body: { moved: [7] } },
    });

    const result = await run(['handovers', 'accept', 'h1'], {
      isTTY: true,
      confirm: true,
      select: 'labs',
    });

    expect(result.code).toBe(0);
    expect(result.asked[0]).toBe('Accept it into which workspace?');
    expect(bodyOf(dojo, 'POST /api/handovers/h1/accept')).toEqual({ workspace: 3 });
  });

  it.each([
    [
      { recipient: false },
      'This handover was sent to bo@example.com. Sign in as them to accept it.',
    ],
    [{ status: 'expired' }, 'This handover is expired. Ask for a new one.'],
    [{ workspaces: [] }, 'You admin no workspace that can take the project Ops.'],
  ])('refuses %j before accepting', async (change, message) => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': { body: { ...pending, ...change } },
    });

    const result = await run(['handovers', 'accept', 'h1', '--yes']);

    expect(result.code).not.toBe(0);
    expect(result.stderr()[0]).toContain(message);
    expect(changes(dojo)).toEqual([]);
  });

  it("prints Dojo's refusal for room with the page that pays for it", async () => {
    const url = 'https://dojo.example/billing/upgrade?workspace=2';
    const { run } = await setup({
      'GET /api/handovers/h1/details': { body: pending },
      'POST /api/handovers/h1/accept': {
        status: 409,
        body: {
          errors: [
            { message: 'Acme has no paid app free for this app.', data: { code: 'conflict', url } },
          ],
        },
      },
    });

    const text = await run(['handovers', 'accept', 'h1', '--yes']);

    expect(text.code).toBe(1);
    expect(text.stderr()).toEqual([
      `[frogbot] Dojo couldn't accept the project Ops: Acme has no paid app free for this app. ${url}`,
    ]);

    const json = await run(['handovers', 'accept', 'h1', '--yes', '--json']);

    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({ ok: false, status: 409, url });
  });
});

describe('handovers remove-access', () => {
  const accepted = { ...pending, status: 'accepted', recipient: false, toWorkspace: 'Acme' };

  it('names who loses access when it asks', async () => {
    const { run } = await setup({ 'GET /api/handovers/h1/details': { body: accepted } });

    const result = await run(['handovers', 'remove-access', 'h1'], {
      isTTY: true,
      confirm: false,
    });

    expect(result.asked).toEqual([
      'Remove 1 person outside Acme from the project Ops? ada@example.com',
    ]);
  });

  it('sends nothing when nobody is outside the new workspace', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': { body: { ...accepted, people: [] } },
    });

    const result = await run(['handovers', 'remove-access', 'h1', '--yes', '--json']);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({ id: 'h1', removed: 0 });
    expect(changes(dojo)).toEqual([]);
  });

  it('refuses a handover that was never accepted', async () => {
    const { dojo, run } = await setup({ 'GET /api/handovers/h1/details': { body: pending } });

    const result = await run(['handovers', 'remove-access', 'h1', '--yes']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] This handover is pending. Access is removed only after it's accepted.",
    ]);
    expect(changes(dojo)).toEqual([]);
  });
});

describe('apps handover', () => {
  it('prints the handover and how to take it back', async () => {
    const { dojo, run } = await setup({
      'POST /api/apps/7/handover': {
        body: {
          handover: { id: 'h9', email: 'bo@example.com', expiresAt: '2026-11-29T00:00:00Z' },
          sent: false,
        },
      },
    });

    const result = await run(['apps', 'handover', 'deals', '--to', ' bo@example.com ', '--yes']);

    expect(result.code).toBe(0);
    expect(bodyOf(dojo, 'POST /api/apps/7/handover')).toEqual({ email: 'bo@example.com' });
    expect(result.stdout()).toEqual([
      '[frogbot] Handover of deals to bo@example.com waits until 2026-11-29T00:00:00Z (h9).',
      "Dojo couldn't email bo@example.com; send them the id above.",
      'frogbot dojo handovers cancel h9 takes it back.',
    ]);
  });
});

describe('apps move --project', () => {
  it("looks the project up in the app's workspace only", async () => {
    const { dojo, run } = await setup({
      'GET /api/projects': { body: { docs: [] } },
    });

    const result = await run(['apps', 'move', 'deals', '--project', 'Ops', '--yes']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] No project "Ops" in deals\'s workspace. projects list shows yours.',
    ]);

    const listed = dojo.requests.find(({ path }) => path === '/api/projects');

    expect(decodeURIComponent(listed?.search ?? '')).toContain('where[workspace][equals]=1');
    expect(changes(dojo)).toEqual([]);
  });
});

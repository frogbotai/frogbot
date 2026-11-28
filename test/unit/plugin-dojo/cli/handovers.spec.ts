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

type Options = {
  isTTY?: boolean;
  confirm?: boolean;
  select?: string;
  onWait?: () => void;
};

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

  const run = async (args: string[], { onWait, ...options }: Options = {}) => {
    const result = testIO({ cwd, env, ...options });

    if (onWait) {
      result.io.wait = () => {
        onWait();

        return Promise.resolve();
      };
    }

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

  it.each([['https://dojo.frogbot.ai/'], ['https://dojo.frogbot.ai'], ['  ']])(
    'refuses %j with exit 2 and no request',
    async (link) => {
      const { dojo, run } = await setup();

      const result = await run(['handovers', 'details', link]);

      expect(result.code).toBe(2);
      expect(dojo.paths()).toEqual([]);
    },
  );
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
    [{ status: 'expired' }, "This handover is expired, so it can't be accepted."],
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

    expect(text.code).toBe(4);
    expect(text.stderr()).toEqual([
      `[frogbot] Dojo couldn't accept the project Ops: Acme has no paid app free for this app. Pay for room at ${url}, then run the command again. Add --wait to wait for the payment here.`,
    ]);

    const json = await run(['handovers', 'accept', 'h1', '--yes', '--json']);

    expect(json.code).toBe(4);
    expect(JSON.parse(json.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'conflict',
      status: 409,
      url,
      needs: 'payment',
      link: url,
    });
  });
});

describe('--wait on a move or accept that needs room paid for', () => {
  const url = 'https://dojo.example/billing/upgrade?workspace=2';
  const noRoom = {
    status: 409,
    body: {
      errors: [
        { message: 'Acme has no paid app free for this app.', data: { code: 'conflict', url } },
      ],
    },
  };

  it.each([
    [
      ['handovers', 'accept', 'h1', '--yes'],
      'POST /api/handovers/h1/accept',
      "Dojo couldn't accept the project Ops",
    ],
    [
      ['apps', 'move', 'deals', '--workspace', 'acme', '--yes'],
      'POST /api/apps/7/move',
      "Dojo couldn't move deals",
    ],
    [
      ['projects', 'move', 'p1', '--workspace', 'acme', '--yes'],
      'POST /api/projects/p1/move',
      "Dojo couldn't move Ops",
    ],
  ])(
    '%j shows the pay page once, then sends it again until Dojo takes it',
    async (args, route, lead) => {
      const { dojo, run } = await setup({
        'GET /api/handovers/h1/details': { body: pending },
        'GET /api/projects': {
          body: { docs: [{ id: 'p1', name: 'Ops', workspace: 1, isDefault: false }] },
        },
        [route]: noRoom,
      });

      let waits = 0;

      const result = await run([...args, '--wait', '--json'], {
        onWait: () => {
          waits += 1;

          if (waits === 2) dojo.replies.set(route, { body: { moved: [7] } });
        },
      });

      expect(result.code).toBe(0);
      expect(dojo.paths().filter((each) => each === route)).toHaveLength(3);
      expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({ moved: [7] });
      expect(result.stderr()).toEqual(
        expect.arrayContaining([
          `[frogbot] ${lead}: Acme has no paid app free for this app.`,
          url,
          '[frogbot] Paid. Carrying on.',
        ]),
      );
      expect(result.stderr().filter((line) => line === url)).toHaveLength(1);
    },
  );

  it('gives up with exit 1 after 30 minutes without the payment', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': { body: pending },
      'POST /api/handovers/h1/accept': noRoom,
    });

    const result = await run(['handovers', 'accept', 'h1', '--yes', '--wait', '--json']);

    expect(result.code).toBe(1);
    expect(dojo.paths().filter((each) => each === 'POST /api/handovers/h1/accept')).toHaveLength(
      361,
    );
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'conflict',
      url,
      error:
        "Dojo still has no payment for the room after 30 minutes. Once it's paid, run the command again.",
    });
  });
});

describe('handovers remove-access', () => {
  const accepted = {
    ...pending,
    status: 'accepted',
    recipient: false,
    toWorkspace: 'Acme',
    canRemove: true,
  };

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

  it('refuses with what it needs, and sends nothing, when Dojo says you may not remove access', async () => {
    const { dojo, run } = await setup({
      'GET /api/handovers/h1/details': { body: { ...accepted, canRemove: false } },
    });

    const result = await run(['handovers', 'remove-access', 'h1', '--yes']);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      '[frogbot] Removing access to the project Ops needs Admin access to Acme, the workspace it moved into.',
    ]);
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

describe('the default project', () => {
  const ops = { id: 'p1', name: 'Ops', workspace: 1, isDefault: true };

  it.each([
    [['projects', 'move', 'Ops', '--workspace', 'acme', '--yes'], 'POST /api/projects/p1/move'],
    [
      ['projects', 'handover', 'Ops', '--to', 'bo@example.com', '--yes'],
      'POST /api/projects/p1/handover',
    ],
  ])('%j stops before asking or sending', async (args, route) => {
    const { dojo, run } = await setup({
      'GET /api/projects': { body: { docs: [ops] } },
      [route]: { status: 404, body: { errors: [{ message: 'Project not found.' }] } },
    });

    const result = await run(args);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] The workspace's default project can't move. Move its apps one by one.",
    ]);
    expect(changes(dojo)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { deployDojo } from './deployDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

const why =
  '[frogbot] This workspace has no plan yet. Each app is $29 a month on Pro or $79 on Business.';

async function setup(files?: Record<string, string>) {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  await writeApp(root, files);
  dojo.tokens.set('fb_stored', 100);
  await writeToken(env, dojo.url, 'fb_stored');
  dojo.billing = { paidApps: 0 };

  const run = async (
    options: Omit<Parameters<typeof testIO>[0], 'cwd' | 'env'> = {},
    args = ['--wait'],
  ) => {
    const io = testIO({ cwd: root, env, ...options });

    return { code: await deployDojo(['--no-data', ...args], io.io), ...io };
  };

  const payAfterPolls = (polls: number) => {
    let seen = 0;

    dojo.afterRequest = (route) => {
      if (route !== 'GET /api/workspaces/1') return;

      seen += 1;

      if (seen === polls) dojo.billing = { subscriptionStatus: 'active', paidApps: 1 };
    };
  };

  const upgrade = () => `${dojo.url}/billing/upgrade?workspace=1&apps=1`;

  return { dojo, run, payAfterPolls, upgrade };
}

describe('frogbot deploy: paying for a first deploy', () => {
  it('opens the upgrade page, waits for the payment, and creates the app without a second share', async () => {
    const { dojo, run, payAfterPolls, upgrade } = await setup();

    payAfterPolls(2);

    const result = await run({ isTTY: true });

    expect(result.code).toBe(0);
    expect(result.stdout().slice(0, 4)).toEqual([
      why,
      '[frogbot] Pay for it here; the deploy carries on once Dojo has the payment:',
      upgrade(),
      '[frogbot] Paid. Carrying on.',
    ]);
    expect(result.opened).toEqual([upgrade()]);
    expect(dojo.paths().slice(0, 7)).toEqual([
      'GET /api/users/me',
      'GET /api/workspaces',
      'POST /api/apps',
      'GET /api/workspaces/1',
      'GET /api/workspaces/1',
      'GET /api/workspaces/1',
      'POST /api/apps',
    ]);
    expect(dojo.apps).toHaveLength(1);
    expect(result.stdout().at(-1)).toBe('https://deals.frogbot.app');
    expect(result.stderr()).toEqual([]);
  });

  it('waits the same way for a linked app that never started, and uploads it again', async () => {
    const { dojo, run, payAfterPolls, upgrade } = await setup({
      '.frogbot/app.json': '{"appId":1}',
    });

    dojo.apps.push({ id: 1, name: 'deals', slug: 'deals', workspace: 1 });
    payAfterPolls(1);

    const result = await run();

    expect(result.code).toBe(0);
    expect(result.opened).toEqual([]);
    expect(result.stdout()).toContain(upgrade());
    expect(dojo.paths().filter((path) => path === 'POST /api/apps/1/deployments')).toHaveLength(2);
    expect(dojo.requests.at(-2)?.form?.get('source')).toBeInstanceOf(File);
    expect(result.stdout().at(-1)).toBe('https://deals.frogbot.app');
  });

  it("asks for a workspace owner, without opening the page, when the person can't pay", async () => {
    const { dojo, run, payAfterPolls, upgrade } = await setup();

    dojo.billing = { paidApps: 0, owner: false };
    payAfterPolls(1);

    const result = await run({ isTTY: true });

    expect(result.code).toBe(0);
    expect(result.stdout().slice(0, 3)).toEqual([
      why,
      '[frogbot] Ask a workspace owner to pay for it here; the deploy carries on once Dojo has the payment:',
      upgrade(),
    ]);
    expect(result.opened).toEqual([]);
  });

  it('stops after 30 minutes without a payment', async () => {
    const { dojo, run } = await setup();
    const result = await run();

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Dojo still has no payment for this app after 30 minutes. Once it's paid, deploy again.",
    ]);
    expect(dojo.paths().filter((path) => path === 'GET /api/workspaces/1')).toHaveLength(360);
    expect(dojo.apps).toEqual([]);
  });

  it('keeps payment_required and the upgrade link when a --wait share stops under --json', async () => {
    const { run, upgrade } = await setup();
    const result = await run({}, ['--wait', '--json']);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'payment_required',
      status: 402,
      url: upgrade(),
    });
  });

  it('exits 4 with the link at once without a terminal or --wait, and creates the app on the next run once paid', async () => {
    const { dojo, run, upgrade } = await setup();
    const first = await run({}, []);

    expect(first.code).toBe(4);
    expect(first.stderr()).toEqual([
      `${why} Pay for it at ${upgrade()}, then run the command again. Add --wait to wait for the payment here.`,
    ]);
    expect(dojo.paths()).not.toContain('GET /api/workspaces/1');
    expect(dojo.apps).toEqual([]);

    dojo.billing = { subscriptionStatus: 'active', paidApps: 1 };

    const second = await run({}, []);

    expect(second.code).toBe(0);
    expect(dojo.apps).toHaveLength(1);
  });

  it('names the workspace owner in the exit when the person cannot pay', async () => {
    const { dojo, run, upgrade } = await setup();

    dojo.billing = { paidApps: 0, owner: false };

    const result = await run({}, ['--json']);

    expect(result.code).toBe(4);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'payment_required',
      error: expect.stringContaining(`Ask a workspace owner to pay for it at ${upgrade()}`),
      needs: 'payment',
      link: upgrade(),
    });
  });

  it("keeps Dojo's message for a 402 with no upgrade link", async () => {
    const { dojo, run } = await setup();

    dojo.createReply = { status: 402, body: { errors: [{ message: 'Payment required.' }] } };

    const result = await run();

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual(["[frogbot] Dojo couldn't create the app: Payment required."]);
    expect(dojo.paths()).not.toContain('GET /api/workspaces/1');
  });
});

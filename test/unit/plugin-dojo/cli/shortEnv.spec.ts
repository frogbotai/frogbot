import { describe, expect, it } from 'vitest';

import { runDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeFiles } from './helpers.js';

const app = {
  id: 7,
  slug: 'deals',
  url: 'https://deals.frogbot.app',
  status: 'live',
  deployment: 30,
  started: true,
};

async function setup({ isTTY = false, linked = true } = {}) {
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
  dojo.replies.set('GET /api/apps/7/cli', { body: app });

  dojo.replies.set('PUT /api/apps/7/keys', {
    body: { changed: ['api_key', 'other_key'], retrying: false },
  });

  if (linked) await writeFiles(cwd, { '.frogbot/app.json': '{ "appId": 7 }' });

  const run = async (...args: string[]) => {
    const io = testIO({ cwd, env, isTTY, confirm: true });

    return { code: await runDojo(args, io.io), ...io };
  };

  return { dojo, run, cwd };
}

const sent = (dojo: FakeDojo, route: string) =>
  dojo.requests
    .filter(({ method, path }) => `${method} ${path}` === route)
    .map(({ body }) => JSON.parse(body.toString()) as unknown);

describe('frogbot dojo env unset in a linked folder', () => {
  it('removes lowercase keys, which env accepts, from the folder’s app', async () => {
    const { dojo, run } = await setup();
    const result = await run('env', 'unset', 'api_key', 'other_key', '--yes');

    expect(result.stderr()).toEqual([]);
    expect(result.code).toBe(0);
    expect(dojo.requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      'PUT /api/apps/7/keys',
    );
  });

  it('asks about the folder’s app by its slug, not its id', async () => {
    const { run } = await setup({ isTTY: true });

    const result = await run('env', 'unset', 'FOO', 'BAR');

    expect(result.asked).toEqual(['Remove FOO, BAR from deals?']);
  });
});

describe('frogbot dojo env unset: which argument is the app', () => {
  it('reads every argument as a key in a linked folder, even one that looks like a slug', async () => {
    const { dojo, run } = await setup();

    const result = await run('env', 'unset', 'deals', 'STRIPE_KEY', '--yes');

    expect(result.code).toBe(0);
    expect(sent(dojo, 'PUT /api/apps/7/keys')).toEqual([
      { values: { deals: null, STRIPE_KEY: null } },
    ]);
  });

  it('takes another app with --app in a linked folder', async () => {
    const { dojo, run } = await setup();

    dojo.apps.push({ id: 8, name: 'Leads', slug: 'leads', workspace: 1 });
    dojo.replies.set('PUT /api/apps/8/keys', { body: { changed: ['api_key'], retrying: false } });

    const result = await run('env', 'unset', 'api_key', '--app', 'leads', '--yes');

    expect(result.code).toBe(0);
    expect(sent(dojo, 'PUT /api/apps/8/keys')).toEqual([{ values: { api_key: null } }]);
    expect(sent(dojo, 'PUT /api/apps/7/keys')).toEqual([]);
  });

  it('asks about the --app app by its slug', async () => {
    const { run } = await setup({ isTTY: true });

    const result = await run('env', 'unset', 'FOO', '--app', '7');

    expect(result.asked).toEqual(['Remove FOO from deals?']);
  });

  it('reads the first argument as the app outside a linked folder', async () => {
    const { dojo, run } = await setup({ linked: false });

    const result = await run('env', 'unset', 'deals', 'api_key', '--yes');

    expect(result.code).toBe(0);
    expect(sent(dojo, 'PUT /api/apps/7/keys')).toEqual([{ values: { api_key: null } }]);
  });

  it('reads the first argument as the app when the folder’s link has no app id', async () => {
    const { dojo, run, cwd } = await setup({ linked: false });

    await writeFiles(cwd, { '.frogbot/app.json': '{}' });

    const result = await run('env', 'unset', 'deals', 'FOO', '--yes');

    expect(result.code).toBe(0);
    expect(sent(dojo, 'PUT /api/apps/7/keys')).toEqual([{ values: { FOO: null } }]);
  });

  it('takes --app outside a linked folder', async () => {
    const { dojo, run } = await setup({ linked: false });

    const result = await run('env', 'unset', 'api_key', '--app', 'deals', '--yes');

    expect(result.code).toBe(0);
    expect(sent(dojo, 'PUT /api/apps/7/keys')).toEqual([{ values: { api_key: null } }]);
  });

  it('refuses one key outside a linked folder, naming the missing app', async () => {
    const { dojo, run } = await setup({ linked: false });

    const result = await run('env', 'unset', 'api_key', '--yes');

    expect(result.code).toBe(2);
    expect(result.stderr().join('\n')).toContain('No app here');
    expect(sent(dojo, 'PUT /api/apps/7/keys')).toEqual([]);
  });
});

describe('frogbot dojo apps rename in a linked folder', () => {
  it('renames the folder’s app when given only the new name', async () => {
    const { dojo, run } = await setup();

    dojo.replies.set('PATCH /api/apps/7', {
      body: { doc: { id: 7, name: 'Deal Room', slug: 'deals' } },
    });

    const result = await run('apps', 'rename', 'Deal Room', '--json');

    expect(result.code).toBe(0);
    expect(sent(dojo, 'PATCH /api/apps/7')).toEqual([{ name: 'Deal Room' }]);
  });
});

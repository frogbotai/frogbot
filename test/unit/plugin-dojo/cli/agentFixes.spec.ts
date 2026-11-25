import { describe, expect, it } from 'vitest';

import { verbFlags } from '../../../../packages/plugins/plugin-dojo/src/cli/command.js';
import {
  dojoCommands,
  runDojo,
} from '../../../../packages/plugins/plugin-dojo/src/cli/commands.js';
import type { FakeDojo } from './fakeDojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO } from './helpers.js';

type Reply = { status?: number; body: unknown };

const workspace = { id: 1, name: 'Trend Capital', slug: 'trend-capital' };
const project = { id: 'p1', name: 'Deals', workspace: 1, isDefault: false };
const trashed = [
  { id: 8, name: 'Old CRM ', slug: 'old-crm', workspace: 1, deletedAt: '2026-11-20T00:00:00Z' },
  { id: 9, name: 'Leads', slug: 'leads', workspace: 1, deletedAt: '2026-11-21T00:00:00Z' },
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
  dojo.workspaces.splice(0, dojo.workspaces.length, workspace);

  for (const [route, reply] of Object.entries(replies)) dojo.replies.set(route, reply);

  const cwd = await tempDir();

  return {
    dojo,
    run: async (args: string[], options: { isTTY?: boolean; confirm?: boolean } = {}) => {
      const result = testIO({ cwd, env, ...options });

      return { ...result, code: await runDojo(args, result.io) };
    },
  };
}

const changes = (dojo: FakeDojo) =>
  dojo.requests
    .filter(({ method }) => method !== 'GET')
    .map(({ method, path, body }) => {
      const text = body.toString();

      return [`${method} ${path}`, text ? JSON.parse(text) : undefined];
    });

describe('deployments logs --follow --json on a failed build', () => {
  it('prints one JSON value with BUILD_FAILED and the deployment id', async () => {
    const { dojo, run } = await setup();

    dojo.build = { lines: ['step 1'], status: 'failed', error: 'npm ci failed' };

    const result = await run(['deployments', 'logs', '7', '--follow', '--json']);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      ok: false,
      code: 'BUILD_FAILED',
      error: 'Build failed: npm ci failed. Fix it, then frogbot deploy ships it again.',
      deploymentId: '7',
    });
  });
});

describe('--purge-trash', () => {
  const trashList = { 'GET /api/apps': { body: { docs: trashed } } };

  it('deletes the workspace’s apps in Trash for good, by name, then the workspace', async () => {
    const { dojo, run } = await setup({
      ...trashList,
      'POST /api/apps/8/delete-permanently': { body: { deleted: true } },
      'POST /api/apps/9/delete-permanently': { body: { deleted: true } },
      'POST /api/workspaces/1/delete': { body: { deleted: true } },
    });

    const result = await run([
      'workspaces',
      'delete',
      'trend-capital',
      '--purge-trash',
      '--yes',
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout().join('\n'))).toEqual({
      deleted: workspace,
      purged: ['old-crm', 'leads'],
    });
    expect(changes(dojo)).toEqual([
      ['POST /api/apps/8/delete-permanently', { name: 'Old CRM' }],
      ['POST /api/apps/9/delete-permanently', { name: 'Leads' }],
      ['POST /api/workspaces/1/delete', { name: 'Trend Capital' }],
    ]);

    const listed = dojo.requests.find(({ path }) => path === '/api/apps');

    expect(new URLSearchParams(listed?.search).get('trash')).toBe('true');
    expect(listed?.search).toContain('where[workspace][equals]=1');
  });

  it('lists the apps it will purge when it asks, and purges nothing on no', async () => {
    const { dojo, run } = await setup(trashList);

    const result = await run(['workspaces', 'delete', 'trend-capital', '--purge-trash'], {
      isTTY: true,
      confirm: false,
    });

    expect(result.code).toBe(1);
    expect(result.asked[0]).toContain(
      "2 apps in Trash (old-crm, leads) are deleted for good first, even if apps you can't see still block the delete.",
    );
    expect(changes(dojo)).toEqual([]);
  });

  it('deletes the project’s apps in Trash, then the project', async () => {
    const { dojo, run } = await setup({
      'GET /api/projects': { body: { docs: [project] } },
      ...trashList,
      'POST /api/apps/8/delete-permanently': { body: { deleted: true } },
      'POST /api/apps/9/delete-permanently': { body: { deleted: true } },
      'DELETE /api/projects/p1': { body: { id: 'p1' } },
    });

    const result = await run(['projects', 'delete', 'Deals', '--purge-trash', '--yes']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toEqual([
      '[frogbot] Deleted for good from Trash: old-crm, leads.',
      '[frogbot] Deleted the project Deals.',
    ]);
    expect(changes(dojo).map(([route]) => route)).toEqual([
      'POST /api/apps/8/delete-permanently',
      'POST /api/apps/9/delete-permanently',
      'DELETE /api/projects/p1',
    ]);
    expect(dojo.requests.find(({ path }) => path === '/api/apps')?.search).toContain(
      'where[project][equals]=p1',
    );
  });

  it('deletes nothing for good while apps outside Trash still block the delete', async () => {
    const { dojo, run } = await setup({
      'GET /api/projects': { body: { docs: [project] } },
      'GET /api/apps': {
        body: { docs: [...trashed, { id: 10, name: 'Live', slug: 'live', workspace: 1 }] },
      },
    });

    const result = await run(['projects', 'delete', 'Deals', '--purge-trash', '--yes', '--json']);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout().join('\n')).error).toBe(
      'Deals still holds 1 app outside Trash (live), so nothing was deleted. Move each with apps move or delete it with apps delete, then rerun with --purge-trash.',
    );
    expect(changes(dojo)).toEqual([]);
  });

  it('names the apps already gone when the purge fails partway', async () => {
    const { run } = await setup({
      ...trashList,
      'POST /api/apps/8/delete-permanently': { body: { deleted: true } },
      'POST /api/apps/9/delete-permanently': {
        status: 500,
        body: { errors: [{ message: 'boom' }] },
      },
    });

    const result = await run([
      'workspaces',
      'delete',
      'trend-capital',
      '--purge-trash',
      '--yes',
      '--json',
    ]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout().join('\n')).error).toBe(
      "Dojo couldn't delete leads for good: boom Already deleted for good: old-crm. Rerun to carry on.",
    );
  });

  it('names what it purged when apps the caller can’t see still block the delete', async () => {
    const { dojo, run } = await setup({
      ...trashList,
      'POST /api/apps/8/delete-permanently': { body: { deleted: true } },
      'POST /api/apps/9/delete-permanently': { body: { deleted: true } },
      'POST /api/workspaces/1/delete': {
        status: 409,
        body: { errors: [{ message: 'This workspace still holds 3 apps, counting Trash.' }] },
      },
    });

    const result = await run([
      'workspaces',
      'delete',
      'trend-capital',
      '--purge-trash',
      '--yes',
      '--json',
    ]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout().join('\n')).error).toBe(
      "Dojo couldn't delete trend-capital: This workspace still holds 3 apps, counting Trash. Already deleted for good from Trash: old-crm, leads. The apps left are ones you can't see: their Admins can move them with apps move or delete them with apps delete, then rerun.",
    );
    expect(changes(dojo).map(([route]) => route)).toEqual([
      'POST /api/apps/8/delete-permanently',
      'POST /api/apps/9/delete-permanently',
      'POST /api/workspaces/1/delete',
    ]);
  });

  it('names --purge-trash when Dojo refuses a workspace delete over its apps', async () => {
    const { run } = await setup({
      'POST /api/workspaces/1/delete': {
        status: 409,
        body: { errors: [{ message: 'This workspace still holds 1 app, counting Trash.' }] },
      },
    });

    const result = await run(['workspaces', 'delete', 'trend-capital', '--yes', '--json']);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      status: 409,
      error: expect.stringContaining('Rerun with --purge-trash'),
    });
  });
});

describe('Dojo error codes', () => {
  it('keeps Dojo’s own code in --json', async () => {
    const { run } = await setup({
      'POST /api/workspaces/1/delete': {
        status: 400,
        body: { errors: [{ message: 'Type the name.', data: { code: 'name_mismatch' } }] },
      },
    });

    const result = await run(['workspaces', 'delete', 'trend-capital', '--yes', '--json']);

    expect(JSON.parse(result.stdout().join('\n'))).toMatchObject({
      ok: false,
      code: 'name_mismatch',
    });
  });
});

describe('confirming verbs', () => {
  const verbs = Object.entries(dojoCommands).flatMap(([name, command]) =>
    'verbs' in command
      ? Object.entries(command.verbs).map(([verb, spec]) => [`${name} ${verb}`, spec] as const)
      : [[name, command] as const],
  );

  const confirming = verbs.filter(([, verb]) => 'confirm' in verb && verb.confirm);

  it('finds the confirming verbs', () => {
    expect(confirming.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'workspaces delete',
        'projects delete',
        'apps delete',
        'members remove',
      ]),
    );
  });

  it.each(confirming.map(([name, verb]) => [name, verb]))('%s takes --yes', (_name, verb) => {
    expect(verbFlags(verb).yes?.type).toBe('boolean');
  });

  it('refuses with exit 2 instead of waiting when there is no terminal and no --yes', async () => {
    const { dojo, run } = await setup();
    const result = await run(['workspaces', 'delete', 'trend-capital']);

    expect(result.code).toBe(2);
    expect(result.stderr()[0]).toContain('rerun with --yes');
    expect(changes(dojo)).toEqual([]);
  });
});

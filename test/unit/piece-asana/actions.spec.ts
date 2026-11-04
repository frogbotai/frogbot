import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createAsana } from '../../../packages/pieces/piece-asana/src/index.js';
import { api, body, calls, json, query, req, stubAsana } from './fixtures.js';

const asana = createAsana({});

type List = (args: { input: Record<string, unknown>; req: unknown }) => Promise<{
  data: unknown[];
  pagination: { count: number; hasMore: boolean; nextCursor: string | null; limit: number };
}>;

const lists: Array<[string, Record<string, unknown>, string, Record<string, string>]> = [
  ['listWorkspaces', {}, '/workspaces', {}],
  ['listTeams', { workspaceGid: '10' }, '/workspaces/10/teams', {}],
  [
    'listProjects',
    { workspaceGid: '10', teamGid: '20', archived: false },
    '/projects',
    { workspace: '10', team: '20', archived: 'false' },
  ],
  ['listSections', { projectGid: '30' }, '/projects/30/sections', {}],
  ['listUsers', { workspaceGid: '10' }, '/users', { workspace: '10' }],
  ['listTasks', { projectGid: '30' }, '/tasks', { project: '30' }],
  ['listSubtasks', { taskGid: '40' }, '/tasks/40/subtasks', {}],
  ['listDependencies', { taskGid: '40' }, '/tasks/40/dependencies', {}],
  ['listCustomFields', { projectGid: '30' }, '/projects/30/custom_field_settings', {}],
  ['listStories', { taskGid: '40' }, '/tasks/40/stories', {}],
  ['listAttachments', { taskGid: '40' }, '/attachments', { parent: '40' }],
];

function list(slug: string) {
  return (asana as unknown as Record<string, List>)[slug];
}

afterEach(() => vi.unstubAllGlobals());

describe('Asana list actions', () => {
  it.each(lists)('%s pages with limit and offset', async (slug, input, path, params) => {
    stubAsana((call) =>
      query(call).offset
        ? json({ data: [{ gid: '2' }], next_page: null })
        : json({ data: [{ gid: '1' }], next_page: { offset: 'eyJ0', path: '/x', uri: 'u' } }),
    );

    const first = await list(slug)({ input: { ...input, limit: 1 }, req: req() });
    const last = await list(slug)({
      input: { ...input, limit: 1, cursor: first.pagination.nextCursor },
      req: req(),
    });

    expect(new URL(calls[0].url).pathname).toBe(`/api/1.0${path}`);
    expect(query(calls[0])).toMatchObject({ ...params, limit: '1' });
    expect(query(calls[0])).not.toHaveProperty('offset');
    expect(query(calls[0]).opt_fields).toContain('name');
    expect(query(calls[1])).toMatchObject({ ...params, limit: '1', offset: 'eyJ0' });
    expect(first).toEqual({
      data: [{ gid: '1' }],
      pagination: { count: 1, hasMore: true, nextCursor: 'eyJ0', limit: 1 },
    });
    expect(last.pagination).toEqual({ count: 1, hasMore: false, nextCursor: null, limit: 1 });
  });

  it('defaults to 50 per page', async () => {
    stubAsana(() => json({ data: [] }));

    await asana.listWorkspaces({ input: {}, req: req() });

    expect(query(calls[0]).limit).toBe('50');
  });

  it('lists a section’s tasks, with every imported task field', async () => {
    stubAsana(() => json({ data: [], next_page: null }));

    await asana.listTasks({ input: { sectionGid: '50' }, req: req() });

    expect(query(calls[0])).toMatchObject({ section: '50' });
    expect(query(calls[0]).opt_fields?.split(',')).toEqual(
      expect.arrayContaining([
        'assignee.email',
        'memberships.section.name',
        'custom_fields.display_value',
        'due_on',
        'parent.name',
      ]),
    );
  });

  it.each([{}, { projectGid: '30', sectionGid: '50' }])(
    'listTasks refuses %j before calling Asana',
    async (input) => {
      stubAsana(() => json({ data: [] }));

      await expect(asana.listTasks({ input, req: req() })).rejects.toThrow(
        'Pass either projectGid or sectionGid.',
      );
      expect(calls).toEqual([]);
    },
  );

  it('refuses a gid that is not numeric', async () => {
    stubAsana(() => json({ data: [] }));

    await expect(
      asana.listSubtasks({ input: { taskGid: '../users/me' }, req: req() }),
    ).rejects.toThrow('Task must be an Asana gid');
    expect(calls).toEqual([]);
  });
});

describe('Asana createTask', () => {
  const input = {
    workspaceGid: '10',
    projectGid: '30',
    name: 'Ship it',
    notes: 'Before Friday',
    dueOn: '2026-11-06',
    assignee: 'me',
  };

  it('posts the task with due_on and matches tags by gid or name', async () => {
    stubAsana((call) =>
      call.url.includes('/tags')
        ? json({
            data: [
              { gid: '7', name: 'Urgent' },
              { gid: '8', name: 'Ops' },
            ],
            next_page: null,
          })
        : json({ data: { gid: '99', name: 'Ship it' } }, 201),
    );

    const result = await asana.createTask({
      input: { ...input, tags: ['urgent', '8'] },
      req: req(),
    });

    expect(result).toMatchObject({ gid: '99', name: 'Ship it' });
    expect(calls[0]?.url).toContain(`${api}/workspaces/10/tags`);
    expect(calls[1]).toMatchObject({ method: 'POST' });
    expect(new URL(calls[1].url).pathname).toBe('/api/1.0/tasks');
    expect(body(calls[1])).toEqual({
      data: {
        workspace: '10',
        projects: ['30'],
        name: 'Ship it',
        notes: 'Before Friday',
        due_on: '2026-11-06',
        assignee: 'me',
        tags: ['7', '8'],
      },
    });
  });

  it('skips the tag lookup without tags', async () => {
    stubAsana(() => json({ data: { gid: '99' } }, 201));

    await asana.createTask({ input, req: req() });

    expect(calls).toHaveLength(1);
  });

  it('throws on an unknown tag and creates nothing', async () => {
    stubAsana(() => json({ data: [{ gid: '7', name: 'Urgent' }] }));

    await expect(
      asana.createTask({ input: { ...input, tags: ['Later'] }, req: req() }),
    ).rejects.toThrow("Asana workspace has no tag 'Later'.");
    expect(calls).toHaveLength(1);
  });

  it('refuses a due date that is not YYYY-MM-DD', async () => {
    stubAsana(() => json({ data: { gid: '99' } }, 201));

    await expect(
      asana.createTask({ input: { ...input, dueOn: 'next friday' }, req: req() }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe('Asana OAuth', () => {
  const definition = pieceFactoryDefinition(createAsana);

  it('signs in at Asana with PKCE and the default scope', () => {
    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://app.asana.com/-/oauth_authorize',
      tokenUrl: 'https://app.asana.com/-/oauth_token',
      pkce: true,
      scopes: { catalog: { default: 'default' }, required: ['default'] },
    });
  });

  it('maps the token and names the account from the token response, with no call', async () => {
    stubAsana(() => json({}));

    const oauth = definition.oauth as {
      toAuth(args: { tokens: object }): unknown;
      account(args: { tokens: object }): Promise<unknown>;
    };

    const tokens = {
      access_token: 'access',
      refresh_token: 'refresh',
      data: { id: 4, gid: '4', name: 'Dana', email: 'dana@acme.com' },
    };

    expect(oauth.toAuth({ tokens })).toEqual({ accessToken: 'access' });
    await expect(oauth.account({ tokens })).resolves.toEqual({
      id: '4',
      label: 'Dana',
      email: 'dana@acme.com',
    });
    expect(() => oauth.toAuth({ tokens: {} })).toThrow(
      'Asana sign-in did not return an access token.',
    );
    await expect(oauth.account({ tokens: { access_token: 'a' } })).rejects.toThrow(
      'Asana sign-in did not name the user.',
    );
    expect(calls).toEqual([]);
  });
});

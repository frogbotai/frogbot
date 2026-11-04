import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createAsanaClient } from '../../../packages/pieces/piece-asana/src/client.js';
import { projectChanged } from '../../../packages/pieces/piece-asana/src/triggers/projectChanged.js';
import { calls, json, query, stubAsana, token } from './fixtures.js';

const client = createAsanaClient({ auth: token });
const input = { projectGid: '30' };
const req = { headers: new Headers() } as unknown as FrogBotRequest;

const event = (gid: string) => ({
  action: 'changed',
  created_at: '2026-11-03T10:00:00.000Z',
  resource: { gid, resource_type: 'task', name: `Task ${gid}` },
  parent: { gid: '30', resource_type: 'project', name: 'Launch' },
  user: { gid: '4', resource_type: 'user', name: 'Dana' },
  change: { field: 'name', action: 'changed' },
});

const expired = (sync: string) =>
  json({ errors: [{ message: 'Sync token invalid or too old.' }], sync }, 412);

function poll(cursor?: unknown) {
  return projectChanged.run({ input, client, options: {}, req, cursor: cursor as never });
}

afterEach(() => vi.unstubAllGlobals());

describe('Asana projectChanged', () => {
  it('starts with no events and the sync token from the 412', async () => {
    stubAsana(() => expired('sync-0'));

    await expect(poll()).resolves.toEqual({ events: [], cursor: { sync: 'sync-0' } });
    expect(calls).toHaveLength(1);
    expect(query(calls[0])).toMatchObject({ resource: '30' });
    expect(query(calls[0])).not.toHaveProperty('sync');
  });

  it('reads pages while has_more, keeping the last sync token', async () => {
    stubAsana((call) => {
      const sync = query(call).sync;

      return sync === 'sync-0'
        ? json({ data: [event('1')], sync: 'sync-1', has_more: true })
        : json({ data: [event('2')], sync: 'sync-2', has_more: false });
    });

    await expect(poll({ sync: 'sync-0' })).resolves.toEqual({
      events: [
        { type: 'event', event: event('1') },
        { type: 'event', event: event('2') },
      ],
      cursor: { sync: 'sync-2' },
    });
    expect(calls.map((call) => query(call).sync)).toEqual(['sync-0', 'sync-1']);
  });

  it('stops after 10 pages and resumes from the last token next poll', async () => {
    let page = 0;

    stubAsana(() => {
      page++;

      return json({ data: [event(String(page))], sync: `sync-${page}`, has_more: true });
    });

    const result = await poll({ sync: 'sync-0' });

    expect(calls).toHaveLength(10);
    expect(result.events).toHaveLength(10);
    expect(result.cursor).toEqual({ sync: 'sync-10' });
  });

  it('expands names through opt_fields, with no extra fetch', async () => {
    stubAsana(() => json({ data: [event('1')], sync: 'sync-1', has_more: false }));

    const result = await poll({ sync: 'sync-0' });

    expect(calls).toHaveLength(1);
    expect(query(calls[0]).opt_fields?.split(',')).toEqual(
      expect.arrayContaining(['resource.name', 'parent.name', 'user.name', 'change.field']),
    );
    expect(result.events[0]).toMatchObject({
      event: { resource: { name: 'Task 1' }, user: { name: 'Dana' } },
    });
  });

  it('emits one resync and the fresh token when the token expired', async () => {
    stubAsana(() => expired('sync-new'));

    await expect(poll({ sync: 'sync-old' })).resolves.toEqual({
      events: [{ type: 'resync', projectGid: '30', detectedAt: expect.any(String) }],
      cursor: { sync: 'sync-new' },
    });
  });

  it('throws other failures', async () => {
    stubAsana(() => json({ errors: [{ message: 'project: Not a recognized ID' }] }, 400));

    await expect(poll({ sync: 'sync-0' })).rejects.toThrow(
      'Asana request failed (400): project: Not a recognized ID',
    );
  });

  it('throws a 412 that carries no sync token', async () => {
    stubAsana(() => json({ errors: [{ message: 'Precondition failed' }] }, 412));

    await expect(poll()).rejects.toThrow('Asana request failed (412): Precondition failed');
  });
});

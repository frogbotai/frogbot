import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createAsanaClient } from '../../../packages/pieces/piece-asana/src/client.js';
import { createAsana } from '../../../packages/pieces/piece-asana/src/index.js';
import { commentAdded } from '../../../packages/pieces/piece-asana/src/triggers/commentAdded.js';
import { taskChanged } from '../../../packages/pieces/piece-asana/src/triggers/taskChanged.js';
import { taskCompleted } from '../../../packages/pieces/piece-asana/src/triggers/taskCompleted.js';
import { taskCreated } from '../../../packages/pieces/piece-asana/src/triggers/taskCreated.js';
import { api, body, calls, json, query, stubAsana, token } from './fixtures.js';

const client = createAsanaClient({ auth: token });
const secret = 'hook-secret';
const state = { webhookGid: '900', secret };
const input = { projectGid: '30' };

const added = {
  action: 'added',
  created_at: '2026-11-03T10:00:00.000Z',
  resource: { gid: '40', resource_type: 'task', resource_subtype: 'default_task' },
  parent: { gid: '30', resource_type: 'project' },
  user: { gid: '4', resource_type: 'user' },
};

const completed = {
  action: 'changed',
  created_at: '2026-11-03T10:05:00.000Z',
  resource: { gid: '40', resource_type: 'task', resource_subtype: 'default_task' },
  parent: null,
  user: { gid: '4', resource_type: 'user' },
  change: { field: 'completed', action: 'changed' },
};

const comment = {
  action: 'added',
  created_at: '2026-11-03T10:10:00.000Z',
  resource: { gid: '70', resource_type: 'story', resource_subtype: 'comment_added' },
  parent: { gid: '40', resource_type: 'task' },
  user: { gid: '4', resource_type: 'user' },
};

function delivery(
  data: unknown,
  { key = secret, signal }: { key?: string; signal?: AbortSignal } = {},
) {
  const raw = JSON.stringify(data);

  return {
    data,
    headers: new Headers({
      'x-hook-signature': createHmac('sha256', key).update(raw).digest('hex'),
    }),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(raw).buffer),
    signal,
  } as unknown as FrogBotRequest;
}

function bare(): FrogBotRequest {
  return { headers: new Headers() } as unknown as FrogBotRequest;
}

const taskRecord = { gid: '40', name: 'Ship it', completed: true };
const storyRecord = { gid: '70', text: 'Looks good', resource_subtype: 'comment_added' };

afterEach(() => vi.unstubAllGlobals());

describe('Asana webhook triggers: onEnable and onDisable', () => {
  it.each([
    [taskCreated, { resource_type: 'task', action: 'added' }],
    [taskChanged, { resource_type: 'task', action: 'changed' }],
    [taskCompleted, { resource_type: 'task', action: 'changed', fields: ['completed'] }],
    [commentAdded, { resource_type: 'story', resource_subtype: 'comment_added', action: 'added' }],
  ])('%#: posts the filter on the project and keeps the 201 secret', async (trigger, filter) => {
    stubAsana(() => json({ data: { gid: '900' }, 'X-Hook-Secret': secret }, 201));

    await expect(
      trigger.onEnable({
        input,
        client,
        options: {},
        req: bare(),
        webhookUrl: 'https://app.test/api/webhooks/asana/42',
      }),
    ).resolves.toEqual(state);
    expect(calls[0]).toMatchObject({ url: `${api}/webhooks`, method: 'POST' });
    expect(body(calls[0])).toEqual({
      data: { resource: '30', target: 'https://app.test/api/webhooks/asana/42', filters: [filter] },
    });
  });

  it('throws, and removes the webhook, when the 201 has no secret', async () => {
    stubAsana((call) =>
      call.method === 'DELETE' ? json({ data: {} }) : json({ data: { gid: '900' } }, 201),
    );

    await expect(
      taskCreated.onEnable({
        input,
        client,
        options: {},
        req: bare(),
        webhookUrl: 'https://x.test',
      }),
    ).rejects.toThrow('Asana created the webhook without returning its X-Hook-Secret.');
    expect(calls[1]).toMatchObject({ url: `${api}/webhooks/900`, method: 'DELETE' });
  });

  it('deletes the webhook, treating a 404 as done', async () => {
    stubAsana(() => json({ errors: [{ message: 'webhook: Unknown object' }] }, 404));

    await expect(
      taskCreated.onDisable({ input, client, options: {}, req: bare(), state }),
    ).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ url: `${api}/webhooks/900`, method: 'DELETE' });
  });

  it('throws other delete failures', async () => {
    stubAsana(() => json({ errors: [{ message: 'Forbidden' }] }, 403));

    await expect(
      taskCreated.onDisable({ input, client, options: {}, req: bare(), state }),
    ).rejects.toThrow('Asana request failed (403): Forbidden');
  });
});

describe('Asana webhook triggers: run', () => {
  it('rejects a bad signature before reading Asana', async () => {
    stubAsana(() => json({ data: taskRecord }));

    await expect(
      taskCreated.run({
        input,
        client,
        options: {},
        req: delivery({ events: [added] }, { key: 'other' }),
        state,
      }),
    ).rejects.toThrow('Asana webhook signature is invalid.');
    expect(calls).toEqual([]);
  });

  it('rejects a delivery with no signature', async () => {
    const req = delivery({ events: [added] });

    req.headers.delete('x-hook-signature');

    await expect(taskCreated.run({ input, client, options: {}, req, state })).rejects.toThrow(
      'Asana webhook signature is invalid.',
    );
  });

  it('returns nothing for a heartbeat', async () => {
    stubAsana(() => json({}));

    await expect(
      taskCreated.run({ input, client, options: {}, req: delivery({ events: [] }), state }),
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it('emits the fetched task with a stable dedupe key', async () => {
    stubAsana(() => json({ data: taskRecord }));

    const first = await taskCreated.run({
      input,
      client,
      options: {},
      req: delivery({ events: [added] }),
      state,
    });

    const again = await taskCreated.run({
      input,
      client,
      options: {},
      req: delivery({ events: [added] }),
      state,
    });

    expect(first).toEqual([
      {
        dedupeKey: expect.stringMatching(/^[\da-f]{64}$/),
        data: { event: added, task: taskRecord },
      },
    ]);
    expect(again[0]?.dedupeKey).toBe(first[0]?.dedupeKey);
    expect(new URL(calls[0].url).pathname).toBe('/api/1.0/tasks/40');
    expect(query(calls[0]).opt_fields).toContain('assignee.email');
  });

  it('gives different events different dedupe keys', async () => {
    stubAsana(() => json({ data: taskRecord }));

    const events = await taskCreated.run({
      input,
      client,
      options: {},
      req: delivery({ events: [added, { ...added, created_at: '2026-11-03T11:00:00.000Z' }] }),
      state,
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.dedupeKey).not.toBe(events[1]?.dedupeKey);
  });

  it('skips events outside the filter', async () => {
    stubAsana(() => json({ data: taskRecord }));

    await expect(
      taskCreated.run({ input, client, options: {}, req: delivery({ events: [comment] }), state }),
    ).resolves.toEqual([]);
  });

  it('emits a comment with its story and task', async () => {
    stubAsana((call) => json({ data: call.url.includes('/stories/') ? storyRecord : taskRecord }));

    await expect(
      commentAdded.run({ input, client, options: {}, req: delivery({ events: [comment] }), state }),
    ).resolves.toEqual([
      {
        dedupeKey: expect.any(String),
        data: { event: comment, story: storyRecord, task: taskRecord },
      },
    ]);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/1.0/stories/70',
      '/api/1.0/tasks/40',
    ]);
  });

  it('falls back to the delivered event when Asana cannot return the task', async () => {
    stubAsana(() => json({ errors: [{ message: 'task: Unknown object' }] }, 404));

    await expect(
      taskCreated.run({ input, client, options: {}, req: delivery({ events: [added] }), state }),
    ).resolves.toEqual([{ dedupeKey: expect.any(String), data: { event: added } }]);
  });

  it('stops when the request aborts during the fetch', async () => {
    const controller = new AbortController();

    stubAsana(() => {
      controller.abort(new Error('Stopped.'));

      throw controller.signal.reason as Error;
    });

    await expect(
      taskCreated.run({
        input,
        client,
        options: {},
        req: delivery({ events: [added] }, { signal: controller.signal }),
        state,
      }),
    ).rejects.toThrow('Stopped.');
  });

  it('taskCompleted emits a completed task and drops one marked not complete', async () => {
    let done = true;

    stubAsana(() => json({ data: { ...taskRecord, completed: done } }));

    await expect(
      taskCompleted.run({
        input,
        client,
        options: {},
        req: delivery({ events: [completed] }),
        state,
      }),
    ).resolves.toHaveLength(1);

    done = false;

    await expect(
      taskCompleted.run({
        input,
        client,
        options: {},
        req: delivery({ events: [completed] }),
        state,
      }),
    ).resolves.toEqual([]);
  });

  it('taskCompleted ignores other field changes', async () => {
    stubAsana(() => json({ data: taskRecord }));

    const renamed = { ...completed, change: { field: 'name', action: 'changed' } };

    await expect(
      taskCompleted.run({
        input,
        client,
        options: {},
        req: delivery({ events: [renamed] }),
        state,
      }),
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('Asana webhook handshake', () => {
  const webhook = pieceFactoryDefinition(createAsana).webhook!;

  it('verifies every request, leaving the signature to the trigger', async () => {
    await expect(webhook.verify?.({ req: bare(), options: {} })).resolves.toBe(true);
  });

  it('echoes X-Hook-Secret with a 200', async () => {
    const req = { headers: new Headers({ 'x-hook-secret': 'abc' }) } as unknown as FrogBotRequest;
    const response = await webhook.handshake?.({ req, options: {} });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('x-hook-secret')).toBe('abc');
  });

  it('returns null without the header', async () => {
    await expect(webhook.handshake?.({ req: bare(), options: {} })).resolves.toBeNull();
  });
});

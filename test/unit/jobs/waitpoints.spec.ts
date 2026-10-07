import type { Payload, Where } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';
import type { JobLeaseContext } from '../../../packages/frogbot/src/jobs/lease.js';
import type * as leaseModule from '../../../packages/frogbot/src/jobs/lease.js';
import type { WorkflowHandler } from '../../../packages/frogbot/src/jobs/types.js';
import { defaultWaitpointsCollection } from '../../../packages/frogbot/src/jobs/waitpoints/collection.js';
import {
  createWaitpoint,
  findWaitpoint,
} from '../../../packages/frogbot/src/jobs/waitpoints/operations.js';
import type {
  Waitpoint,
  WaitpointReplay,
} from '../../../packages/frogbot/src/jobs/waitpoints/types.js';
import { wrapWorkflow } from '../../../packages/frogbot/src/jobs/waitpoints/workflow.js';
import { matches } from '../frogbot/jobs/helpers.js';
import { jobRow, nativeRunner } from '../frogbot/jobs/nativeRunner.js';

const storage = vi.hoisted(() => ({
  rows: [] as Waitpoint[],
  wakeHolder: vi.fn(),
  ready: vi.fn(),
  context: undefined as JobLeaseContext | undefined,
}));

vi.mock('../../../packages/frogbot/src/jobs/lease.js', async (importOriginal) => {
  const actual = await importOriginal<typeof leaseModule>();

  return {
    ...actual,
    getJobLeaseContext: () => actual.getJobLeaseContext() ?? storage.context,
  };
});

vi.mock('../../../packages/frogbot/src/jobs/waitpoints/operations.js', () => ({
  findWaitpoint: vi.fn(
    ({ token, jobId, name }: { token?: string; jobId?: string; name?: string }) =>
      Promise.resolve(
        structuredClone(
          storage.rows.find((row) =>
            token ? row.token === token : row.jobId === jobId && row.name === name,
          ) ?? null,
        ),
      ),
  ),
  createWaitpoint: vi.fn(({ data }: { data: Omit<Waitpoint, 'id'> }) => {
    const row = { id: storage.rows.length + 1, ...structuredClone(data) };

    storage.rows.push(row);

    return Promise.resolve(structuredClone(row));
  }),
  markWaitpointReady: async ({ waitpoint }: { waitpoint: Waitpoint }) => {
    await storage.ready();

    Object.assign(
      storage.rows.find(({ id }) => id === waitpoint.id)!,
      { ready: true },
    );
  },
  dispatchWaitpoint: ({ waitpoint }: { waitpoint: Waitpoint }) =>
    Promise.resolve(storage.wakeHolder(waitpoint)),
  sweepWaitpoints: vi.fn(),
}));

vi.mock('../../../packages/frogbot/src/jobs/waitpoints/atomic.js', () => ({
  updateWaitpoint: vi.fn(({ where, data }: { where: Where; data: Partial<Waitpoint> }) => {
    const row = storage.rows.find((candidate) => matches(candidate, where));

    if (!row) return Promise.resolve(false);

    Object.assign(row, structuredClone(data));

    return Promise.resolve(true);
  }),
}));

const config = { defaultExpiresIn: 7 * 86_400_000, maxExpiresIn: 30 * 86_400_000 };

function workflowArgs(replay?: WaitpointReplay): Parameters<WorkflowHandler>[0] {
  const payload = {
    config: { serverURL: 'https://example.com', routes: { api: '/api' } },
  } as Payload;

  storage.context = {
    owner: 'unit',
    leaseDuration: 5000,
    ids: new Set(),
    rearm: new Map(),
    payload,
  };

  return {
    job: { ...jobRow(1, true), waitpoint: replay },
    req: {
      payload,
    },
    inlineTask: vi.fn(),
    tasks: {},
  } as unknown as Parameters<WorkflowHandler>[0];
}

async function run(handler: WorkflowHandler | string, args = workflowArgs()) {
  const workflow = wrapWorkflow({ workflow: { slug: 'work', handler }, config });

  if (typeof workflow.handler !== 'function') throw new Error('Expected wrapped workflow');

  await workflow.handler(args);
}

beforeEach(() => {
  vi.mocked(findWaitpoint).mockClear();
  vi.mocked(createWaitpoint).mockClear();

  storage.rows.length = 0;
  storage.wakeHolder.mockReset();
  storage.ready.mockReset();
  storage.context = undefined;
});

afterEach(() => vi.useRealTimers());

describe('waitpoint configuration', () => {
  it('resolves millisecond defaults and custom limits', () => {
    expect(resolveJobsConfig().waitpoints).toEqual(config);

    expect(
      resolveJobsConfig({ waitpoints: { defaultExpiresIn: 1000, maxExpiresIn: 2000 } }).waitpoints,
    ).toEqual({ defaultExpiresIn: 1000, maxExpiresIn: 2000 });
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid expiry duration %s',
    (duration) => {
      expect(() => resolveJobsConfig({ waitpoints: { defaultExpiresIn: duration } })).toThrow(
        'milliseconds',
      );

      expect(() => resolveJobsConfig({ waitpoints: { maxExpiresIn: duration } })).toThrow(
        'milliseconds',
      );
    },
  );

  it('rejects a default above the configured maximum', () => {
    expect(() =>
      resolveJobsConfig({ waitpoints: { defaultExpiresIn: 2000, maxExpiresIn: 1000 } }),
    ).toThrow('must not exceed');
  });

  it('links holder jobs behind denied access and unique wait identities', () => {
    const collection = defaultWaitpointsCollection();

    expect(collection.admin?.hidden).toBe(true);
    expect(collection.indexes).toContainEqual({ fields: ['jobId', 'name'], unique: true });
    expect(collection.fields).not.toContainEqual(expect.objectContaining({ name: 'snapshot' }));
    expect(collection.fields).toContainEqual({
      name: 'token',
      type: 'text',
      required: true,
      unique: true,
    });
    expect(collection.fields).toContainEqual({
      name: 'holder',
      type: 'relationship',
      relationTo: 'payload-jobs',
    });

    for (const access of Object.values(collection.access ?? {})) {
      expect((access as () => boolean)()).toBe(false);
    }
  });

  it('protects hidden replay state while preserving collection overrides', () => {
    const jobs = resolveJobsConfig({
      jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
        ...defaultJobsCollection,
        admin: { hidden: false },
        fields: [
          { name: 'waitpoint', type: 'text' },
          { name: 'custom', type: 'text' },
        ],
      }),
    });

    const collection = jobs.jobsCollectionOverrides!({
      defaultJobsCollection: { slug: 'payload-jobs', fields: [] },
    });

    expect(collection.admin?.hidden).toBe(false);
    expect(collection.fields).toContainEqual({ name: 'custom', type: 'text' });
    expect(
      collection.fields.filter((field) => 'name' in field && field.name === 'waitpoint'),
    ).toEqual([expect.objectContaining({ type: 'json', hidden: true })]);
  });
});

describe('workflow wait creation', () => {
  it('rejects a non-workflow job before invoking the handler or accessing storage', async () => {
    const args = workflowArgs();
    const handler = vi.fn();

    delete args.job.workflowSlug;

    await expect(run(handler, args)).rejects.toThrow('FrogBot waitFor requires a workflow job.');

    expect(handler).not.toHaveBeenCalled();
    expect(findWaitpoint).not.toHaveBeenCalled();
    expect(createWaitpoint).not.toHaveBeenCalled();
  });

  it('rejects a delay after the last millisecond of the year 9999', async () => {
    await expect(
      run(async ({ waitFor }) => {
        await waitFor('delay', { until: '+010000-01-01T00:00:00.000Z' });
      }),
    ).rejects.toThrow('FrogBot waitFor until must be on or before 9999-12-31T23:59:59.999Z.');

    expect(storage.rows).toHaveLength(0);
  });

  it('accepts a delay at the last millisecond of the year 9999', async () => {
    await run(async ({ waitFor }) => {
      await waitFor('delay', { until: '9999-12-31T23:59:59.999Z' });
    });

    expect(storage.rows[0].until).toBe('9999-12-31T23:59:59.999Z');
  });

  it('rejects a computed expiry after the last millisecond of the year 9999', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('9999-12-31T23:59:59.999Z'));

    await expect(
      run(async ({ waitFor }) => {
        await waitFor('approval', { expiresIn: 1, onWait: vi.fn() });
      }),
    ).rejects.toThrow('FrogBot waitFor expiresAt must be on or before 9999-12-31T23:59:59.999Z.');

    expect(storage.rows).toHaveLength(0);
  });

  it('accepts a computed expiry at the last millisecond of the year 9999', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('9999-12-31T23:59:59.998Z'));

    await run(async ({ waitFor }) => {
      await waitFor('approval', { expiresIn: 1, onWait: vi.fn() });
    });

    expect(storage.rows[0].expiresAt).toBe('9999-12-31T23:59:59.999Z');
  });

  it('re-arms with the latest inline logs and buffers an early response', async () => {
    const rows = [jobRow(1, true)];
    const later = vi.fn();
    const onWait = vi.fn();

    rows[0].queue = 'approvals';

    const { payload, req } = await nativeRunner({
      rows,
      jobs: {
        workflows: [
          {
            slug: 'work',
            handler: async ({ inlineTask, waitFor }) => {
              await inlineTask('prepare', { task: () => ({ output: { prepared: true } }) });

              await waitFor('approval', {
                onWait: async ({ resumeUrl }) => {
                  onWait(resumeUrl);

                  Object.assign(storage.rows[0], { status: 'resumed', data: { approved: true } });

                  await inlineTask('send', { task: () => ({ output: { sent: true } }) });
                },
              });

              later();
            },
          },
        ],
      },
    });

    payload.config.serverURL = 'https://example.com';

    await payload.jobs.runByID({ id: 1, req, silent: true });

    expect(rows[0].completedAt).toBeNull();
    expect(rows[0].processing).toBe(false);
    expect(rows[0].hasError).not.toBe(true);
    expect(later).not.toHaveBeenCalled();
    expect(onWait).toHaveBeenCalledExactlyOnceWith(
      `https://example.com/api/jobs/${storage.rows[0].token}/resume`,
    );
    expect(Buffer.from(storage.rows[0].token, 'base64url')).toHaveLength(32);
    expect(storage.rows[0].holder).toBe(rows[0].id);
    expect(rows[0].queue).toBe('approvals');
    expect(rows[0].log?.map(({ taskID }) => taskID)).toEqual(['prepare', 'send']);
    expect(storage.wakeHolder).toHaveBeenCalledWith(
      expect.objectContaining({
        ready: true,
        status: 'resumed',
        data: { approved: true },
      }),
    );
  });

  it('filters failed and non-inline logs and detaches the re-arm replay log', async () => {
    const args = workflowArgs();
    const log = {
      id: 'log',
      taskID: 'step',
      executedAt: '',
      completedAt: '',
      state: 'succeeded' as const,
    };

    args.job.log = [
      { ...log, taskSlug: 'inline', output: { value: 'saved' } },
      { ...log, id: 'failed', taskSlug: 'inline', state: 'failed' },
      { ...log, id: 'task', taskSlug: 'work' },
    ];

    await run(async ({ waitFor }) => waitFor('delay', { until: '2026-10-01' }), args);

    args.job.log[0].output = { value: 'changed' };

    expect(storage.context?.rearm.get(1)?.log).toEqual([
      expect.objectContaining({ id: 'log', output: { value: 'saved' } }),
    ]);
    expect(storage.rows[0]).toMatchObject({
      kind: 'delay',
      until: '2026-10-01T00:00:00.000Z',
      ready: true,
    });
  });

  it('retries a failed callback using the same token and original expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00.000Z'));

    const failure = new Error('message failed');
    const onWait = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const handler: WorkflowHandler = async ({ waitFor }) => {
      await waitFor('approval', { onWait });
    };

    await expect(run(handler)).rejects.toBe(failure);

    const { token, expiresAt } = storage.rows[0];

    expect(storage.rows[0].ready).toBe(false);
    expect(storage.wakeHolder).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));

    await run(handler);

    expect(storage.rows).toHaveLength(1);
    expect(storage.rows[0]).toMatchObject({ token, expiresAt, ready: true });
    expect(onWait.mock.calls[0]).toEqual(onWait.mock.calls[1]);
    expect(expiresAt).toBe('2026-09-20T00:00:00.000Z');
  });

  it('consumes a stored response on replay without repeating a ready callback after wake failure', async () => {
    const failure = new Error('wake unavailable');
    const onWait = vi.fn();
    const later = vi.fn();
    const handler: WorkflowHandler = async ({ waitFor }) => {
      await waitFor('approval', { onWait });

      later();
    };

    storage.wakeHolder.mockRejectedValueOnce(failure);

    await expect(run(handler)).rejects.toBe(failure);

    Object.assign(storage.rows[0], { status: 'resumed', data: { approved: true } });

    await run(handler);

    expect(onWait).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledTimes(1);
    expect(storage.rows).toHaveLength(1);
  });

  it('retries an unfinished callback even when its response is already stored', async () => {
    const failure = new Error('callback interrupted');
    const later = vi.fn();
    const onWait = vi
      .fn()
      .mockImplementationOnce(() => {
        Object.assign(storage.rows[0], { status: 'resumed', data: { approved: true } });

        return Promise.reject(failure);
      })
      .mockResolvedValueOnce(undefined);

    const args = workflowArgs({ jobId: 'root', results: {} });
    const handler: WorkflowHandler = async ({ waitFor }) => {
      await waitFor('approval', { onWait });

      later();
    };

    await expect(run(handler, args)).rejects.toBe(failure);

    expect(storage.rows[0]).toMatchObject({ ready: false, status: 'resumed' });
    expect(storage.wakeHolder).not.toHaveBeenCalled();

    await run(handler, args);

    expect(onWait).toHaveBeenCalledTimes(2);
    expect(onWait.mock.calls[0]).toEqual(onWait.mock.calls[1]);
    expect(storage.rows).toHaveLength(1);
    expect(storage.rows[0].ready).toBe(true);
    expect(later).not.toHaveBeenCalled();

    await run(handler, args);

    expect(onWait).toHaveBeenCalledTimes(2);
    expect(later).toHaveBeenCalledOnce();
  });

  it('propagates errors unrelated to the private waiting signal', async () => {
    const error = new Error('workflow failed');

    await expect(run(() => Promise.reject(error))).rejects.toBe(error);
  });

  it('keeps a wait preparing when readiness fails after the callback', async () => {
    const failure = new Error('readiness write failed');
    const onWait = vi.fn();

    storage.ready.mockRejectedValueOnce(failure);

    await expect(
      run(async ({ waitFor }) => {
        await waitFor('approval', { onWait });
      }),
    ).rejects.toBe(failure);

    expect(onWait).toHaveBeenCalledTimes(1);
    expect(storage.rows[0].ready).toBe(false);
    expect(storage.wakeHolder).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'default', suffix: '' },
    { name: 'named', suffix: '#named' },
  ])('wraps dynamically imported $name handlers', async ({ name, suffix }) => {
    const path = new URL('./dynamicWorkflow.ts', import.meta.url).pathname;

    await run(`${path}${suffix}`);

    expect(storage.rows[0]).toMatchObject({ name, kind: 'delay', ready: true });
  });

  it('preserves non-handler configuration and leaves JSON workflows executable', () => {
    const json = [{ task: 'work', id: 'task', input: () => ({}) }];
    const workflow = { slug: 'work', handler: json };

    expect(wrapWorkflow({ workflow, config })).toBe(workflow);

    const handler = vi.fn();
    const inputSchema = [{ name: 'value', type: 'text' as const }];
    const configured = { slug: 'work', handler, inputSchema, queue: 'custom', retries: 3 };
    const wrapped = wrapWorkflow({ workflow: configured, config });

    expect(wrapped.inputSchema).toBe(inputSchema);
    expect(wrapped.queue).toBe('custom');
    expect(wrapped.retries).toBe(3);
    expect(configured.handler).toBe(handler);
    expect(wrapped.handler).not.toBe(handler);
  });

  it.each([0, -1, 0.5, NaN, Infinity, config.maxExpiresIn + 1])(
    'rejects invalid per-wait expiry %s before persisting',
    async (expiresIn) => {
      await expect(
        run(async ({ waitFor }) => {
          await waitFor('approval', { expiresIn, onWait: vi.fn() });
        }),
      ).rejects.toThrow('milliseconds');

      expect(storage.rows).toHaveLength(0);
    },
  );
});

describe('named wait replay', () => {
  it('carries a result consumed from storage into the next re-arm seed', async () => {
    const args = workflowArgs({ jobId: 'root', results: {} });

    storage.rows.push({
      id: 1,
      jobId: 'root',
      name: 'approval',
      token: 'token',
      kind: 'resumable',
      status: 'resumed',
      data: { approved: true },
      ready: true,
      dispatched: true,
      holder: args.job.id,
    });

    await run(async ({ waitFor }) => {
      await waitFor('approval', { onWait: vi.fn() });

      await waitFor('delay', { until: new Date(Date.now() + 60_000) });
    }, args);

    expect(storage.context?.rearm.get(1)?.waitpoint).toEqual({
      jobId: 'root',
      results: { approval: { expired: false, data: { approved: true } } },
      waiting: 'delay',
    });
  });

  it('keeps completed results when the configured expiry maximum is lowered', async () => {
    const args = workflowArgs({ jobId: 'root', results: { approval: { expired: true } } });
    let result: unknown;

    await run(async ({ waitFor }) => {
      result = await waitFor('approval', {
        expiresIn: config.maxExpiresIn + 1,
        onWait: vi.fn(),
      });
    }, args);

    expect(result).toEqual({ expired: true });
    expect(storage.rows).toHaveLength(0);
  });

  it('retains input, earlier results and inline outputs on the same row across multiple waits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00.000Z'));

    const rows = [jobRow(1, true)];
    const prepare = vi.fn(() => Promise.resolve({ output: { prepared: true } }));
    const onWait = vi.fn();
    const received: unknown[] = [];

    rows[0].queue = 'approvals';
    rows[0].input = { request: 'approval-42' };

    const { payload, req } = await nativeRunner({
      rows,
      jobs: {
        workflows: [
          {
            slug: 'work',
            handler: async ({ inlineTask, waitFor }) => {
              await inlineTask('prepare', { task: prepare });

              const approval = await waitFor<{ approved: boolean }>('approval', { onWait });

              await waitFor('cooldown', { until: '2026-10-01' });

              const reply = await waitFor('reply', { onWait });

              received.push({ approval, reply });
            },
          },
        ],
      },
    });

    payload.config.serverURL = 'https://example.com';

    await payload.jobs.runByID({ id: 1, req, silent: true });

    Object.assign(storage.rows[0], { status: 'resumed', data: { approved: true } });

    await payload.jobs.runByID({ id: 1, req, silent: true });

    expect(rows[0]).toMatchObject({
      id: 1,
      queue: 'approvals',
      input: { request: 'approval-42' },
      waitUntil: '2026-10-01T00:00:00.000Z',
    });

    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));

    await payload.jobs.runByID({ id: 1, req, silent: true });

    expect(storage.rows.map(({ jobId, name }) => [jobId, name])).toEqual([
      ['1', 'approval'],
      ['1', 'cooldown'],
      ['1', 'reply'],
    ]);
    expect(rows[0]).toMatchObject({
      waitpoint: {
        jobId: '1',
        results: {
          approval: { expired: false, data: { approved: true } },
          cooldown: null,
        },
      },
    });
    expect(storage.rows.map(({ holder }) => holder)).toEqual([1, 1, 1]);
    expect(rows[0].log?.map(({ taskID }) => taskID)).toEqual(['prepare']);

    vi.setSystemTime(new Date(storage.rows[2].expiresAt!));

    await payload.jobs.runByID({ id: 1, req, silent: true });

    expect(storage.rows[2].status).toBe('expired');
    expect(received).toEqual([
      {
        approval: { expired: false, data: { approved: true } },
        reply: { expired: true },
      },
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledTimes(2);
    expect(rows[0].completedAt).toEqual(expect.any(String));
    expect(rows).toHaveLength(1);
  });

  it('rejects duplicate names after replay without invoking the callback', async () => {
    const onWait = vi.fn();
    const args = workflowArgs({ jobId: 'root', results: { approval: { expired: true } } });

    await expect(
      run(async ({ waitFor }) => {
        await waitFor('approval', { onWait });

        await waitFor('approval', { onWait });
      }, args),
    ).rejects.toThrow("name 'approval' is duplicated");

    expect(onWait).not.toHaveBeenCalled();
    expect(storage.rows).toHaveLength(0);
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects reserved wait name %s before callback or storage',
    async (name) => {
      const onWait = vi.fn();

      await expect(
        run(async ({ waitFor }) => {
          await waitFor(name, { onWait });
        }),
      ).rejects.toThrow(`FrogBot waitFor name '${name}' is reserved.`);

      expect(onWait).not.toHaveBeenCalled();
      expect(findWaitpoint).not.toHaveBeenCalled();
      expect(createWaitpoint).not.toHaveBeenCalled();
      expect(storage.ready).not.toHaveBeenCalled();
      expect(storage.wakeHolder).not.toHaveBeenCalled();
      expect(storage.rows).toHaveLength(0);
    },
  );
});

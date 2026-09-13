import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';
import type { WorkflowHandler } from '../../../packages/frogbot/src/jobs/types.js';
import { defaultWaitpointsCollection } from '../../../packages/frogbot/src/jobs/waitpoints/collection.js';
import {
  createWaitpoint,
  findWaitpoint,
} from '../../../packages/frogbot/src/jobs/waitpoints/operations.js';
import type {
  Waitpoint,
  WaitpointReplay,
  WaitpointSnapshot,
} from '../../../packages/frogbot/src/jobs/waitpoints/types.js';
import { wrapWorkflow } from '../../../packages/frogbot/src/jobs/waitpoints/workflow.js';
import { jobRow, nativeRunner } from '../frogbot/jobs/nativeRunner.js';

const storage = vi.hoisted(() => ({
  rows: [] as Waitpoint[],
  dispatch: vi.fn(),
  ready: vi.fn(),
}));

vi.mock('../../../packages/frogbot/src/jobs/waitpoints/operations.js', () => ({
  findWaitpoint: vi.fn(
    async ({ token, jobId, name }: { token?: string; jobId?: string; name?: string }) =>
      structuredClone(
        storage.rows.find((row) =>
          token ? row.token === token : row.jobId === jobId && row.name === name,
        ) ?? null,
      ),
  ),
  createWaitpoint: vi.fn(async ({ data }: { data: Omit<Waitpoint, 'id'> }) => {
    const row = { id: storage.rows.length + 1, ...structuredClone(data) };

    storage.rows.push(row);

    return structuredClone(row);
  }),
  markWaitpointReady: async ({
    waitpoint,
    snapshot,
  }: {
    waitpoint: Waitpoint;
    snapshot: WaitpointSnapshot;
  }) => {
    await storage.ready();

    Object.assign(
      storage.rows.find(({ id }) => id === waitpoint.id)!,
      {
        ready: true,
        snapshot: structuredClone(snapshot),
      },
    );
  },
  dispatchWaitpoint: async ({ waitpoint }: { waitpoint: Waitpoint }) => storage.dispatch(waitpoint),
  sweepWaitpoints: vi.fn(),
}));

const config = { defaultExpiresIn: 7 * 86_400_000, maxExpiresIn: 30 * 86_400_000 };

function workflowArgs(replay?: WaitpointReplay): Parameters<WorkflowHandler>[0] {
  return {
    job: { ...jobRow(1, true), waitpoint: replay },
    req: {
      payload: { config: { serverURL: 'https://example.com', routes: { api: '/api' } } },
    },
    inlineTask: vi.fn(),
    tasks: {},
  } as unknown as Parameters<WorkflowHandler>[0];
}

async function run(handler: WorkflowHandler, args = workflowArgs()) {
  const workflow = wrapWorkflow({ workflow: { slug: 'work', handler }, config });

  if (typeof workflow.handler !== 'function') throw new Error('Expected wrapped workflow');

  await workflow.handler(args);
}

beforeEach(() => {
  vi.mocked(findWaitpoint).mockClear();
  vi.mocked(createWaitpoint).mockClear();

  storage.rows.length = 0;
  storage.dispatch.mockReset();
  storage.ready.mockReset();
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

  it('stores independent snapshots behind denied access and unique wait identities', () => {
    const collection = defaultWaitpointsCollection();

    expect(collection.admin?.hidden).toBe(true);
    expect(collection.indexes).toContainEqual({ fields: ['jobId', 'name'], unique: true });
    expect(collection.fields).toContainEqual({ name: 'snapshot', type: 'json', required: true });
    expect(collection.fields).toContainEqual({
      name: 'token',
      type: 'text',
      required: true,
      unique: true,
    });
    expect(collection.fields.some(({ type }) => type === 'relationship')).toBe(false);

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
  it('completes cleanly with the latest inline logs and buffers an early response', async () => {
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
              await inlineTask('prepare', { task: async () => ({ output: { prepared: true } }) });

              await waitFor('approval', {
                onWait: async ({ resumeUrl }) => {
                  onWait(resumeUrl);

                  Object.assign(storage.rows[0], { status: 'resumed', data: { approved: true } });

                  await inlineTask('send', { task: async () => ({ output: { sent: true } }) });
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

    expect(rows[0].completedAt).toEqual(expect.any(String));
    expect(rows[0].processing).toBe(false);
    expect(rows[0].hasError).not.toBe(true);
    expect(later).not.toHaveBeenCalled();
    expect(onWait).toHaveBeenCalledExactlyOnceWith(
      `https://example.com/api/jobs/${storage.rows[0].token}/resume`,
    );
    expect(Buffer.from(storage.rows[0].token, 'base64url')).toHaveLength(32);
    expect(storage.rows[0].snapshot.queue).toBe('approvals');
    expect(storage.rows[0].snapshot.log?.map(({ taskID }) => taskID)).toEqual(['prepare', 'send']);
    expect(storage.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        ready: true,
        status: 'resumed',
        data: { approved: true },
        snapshot: storage.rows[0].snapshot,
      }),
    );
  });

  it('filters failed and non-inline logs and detaches the durable snapshot', async () => {
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

    expect(storage.rows[0].snapshot.log).toEqual([
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
    expect(storage.dispatch).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));

    await run(handler);

    expect(storage.rows).toHaveLength(1);
    expect(storage.rows[0]).toMatchObject({ token, expiresAt, ready: true });
    expect(onWait.mock.calls[0]).toEqual(onWait.mock.calls[1]);
    expect(expiresAt).toBe('2026-09-20T00:00:00.000Z');
  });

  it('parks again without repeating a ready callback after dispatch failure', async () => {
    const failure = new Error('queue unavailable');
    const onWait = vi.fn();
    const later = vi.fn();
    const handler: WorkflowHandler = async ({ waitFor }) => {
      await waitFor('approval', { onWait });

      later();
    };

    storage.dispatch.mockRejectedValueOnce(failure);

    await expect(run(handler)).rejects.toBe(failure);

    Object.assign(storage.rows[0], { status: 'resumed', data: { approved: true } });

    await run(handler);

    expect(onWait).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    expect(storage.rows).toHaveLength(1);
  });

  it('propagates errors unrelated to the private waiting signal', async () => {
    const error = new Error('workflow failed');

    await expect(
      run(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it('keeps a wait preparing when readiness fails after the callback', async () => {
    const failure = new Error('snapshot write failed');
    const onWait = vi.fn();

    storage.ready.mockRejectedValueOnce(failure);

    await expect(
      run(async ({ waitFor }) => {
        await waitFor('approval', { onWait });
      }),
    ).rejects.toBe(failure);

    expect(onWait).toHaveBeenCalledTimes(1);
    expect(storage.rows[0].ready).toBe(false);
    expect(storage.dispatch).not.toHaveBeenCalled();
  });

  it.each(['default', 'named'])('wraps dynamically imported %s handlers', async (name) => {
    const path = new URL('./dynamicWorkflow.ts', import.meta.url).pathname;
    const workflow = wrapWorkflow({
      workflow: { slug: 'work', handler: name === 'named' ? `${path}#named` : path },
      config,
    });

    if (typeof workflow.handler !== 'function') throw new Error('Expected wrapped workflow');

    await workflow.handler(workflowArgs());

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

  it('retains earlier results and inline outputs across deleted source jobs and multiple waits', async () => {
    const rows = [jobRow(1, true)];
    const prepare = vi.fn(async () => ({ output: { prepared: true } }));
    const onWait = vi.fn();
    const received: unknown[] = [];

    rows[0].queue = 'approvals';

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

    for (const [index, result] of [
      { expired: false, data: { approved: true } },
      null,
      { expired: true },
    ].entries()) {
      const waitpoint = storage.rows[index];
      const continuation = {
        ...jobRow(index + 2, true),
        input: waitpoint.snapshot.input,
        queue: waitpoint.snapshot.queue,
        log: structuredClone(waitpoint.snapshot.log),
        waitpoint: {
          jobId: waitpoint.jobId,
          results: { ...waitpoint.snapshot.results, [waitpoint.name]: result },
        },
      };

      rows.splice(0, rows.length, continuation);

      await payload.jobs.runByID({ id: continuation.id, req, silent: true });
    }

    expect(storage.rows.map(({ jobId, name }) => [jobId, name])).toEqual([
      ['1', 'approval'],
      ['1', 'cooldown'],
      ['1', 'reply'],
    ]);
    expect(storage.rows[2].snapshot.results).toEqual({
      approval: { expired: false, data: { approved: true } },
      cooldown: null,
    });
    expect(received).toEqual([
      {
        approval: { expired: false, data: { approved: true } },
        reply: { expired: true },
      },
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledTimes(2);
    expect(rows[0].completedAt).toEqual(expect.any(String));
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
      expect(storage.dispatch).not.toHaveBeenCalled();
      expect(storage.rows).toHaveLength(0);
    },
  );
});

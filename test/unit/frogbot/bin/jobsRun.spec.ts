import type { Payload, PayloadRequest, SanitizedConfig } from 'payload';
import { BasePayload } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jobsRun } from '../../../../packages/frogbot/src/bin/jobsRun.js';
import type { FrogbotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import { Frogbot } from '../../../../packages/frogbot/src/frogbot.js';
import {
  createDefaultRequest,
  getCachedFrogbot,
  resetFrogbotCache,
} from '../../../../packages/frogbot/src/getFrogbot.js';
import {
  jobLeaseOperations,
  recordJobClaims,
  withJobLease,
} from '../../../../packages/frogbot/src/jobs/lease.js';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  payload: undefined as unknown as ReturnType<typeof makePayload>,
}));

vi.mock('../../../../packages/frogbot/src/config/load.js', () => ({
  loadConfig: mocks.loadConfig,
}));
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  createLocalReq: vi.fn(async ({ req }, payload) => ({ ...req, payload })),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function makePayload() {
  return {
    config: { collections: [] },
    db: { [jobLeaseOperations]: { update: vi.fn(async () => undefined) } },
    kv: {},
    logger: { warn: vi.fn(), error: vi.fn() },
    secret: 'worker-secret',
    init: vi.fn(async (_args: unknown) => undefined),
    destroy: vi.fn(async () => undefined),
    jobs: {
      handleSchedules: vi.fn(async (_args: unknown) => undefined),
      run: vi.fn(async (_args: unknown) => undefined),
    },
  };
}

describe('jobs:run lifecycle', () => {
  let config: FrogbotSanitizedConfig;
  let payloadConfig: SanitizedConfig;

  let exit: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  let worker: Promise<unknown> | undefined;

  let onInit: ReturnType<typeof vi.fn>;

  let listeners: { SIGINT: number; SIGTERM: number };

  async function start(args = ['--cron', '* * * * * *']) {
    worker = jobsRun(args).catch((error: unknown) => error);

    await vi.waitFor(() => expect(onInit).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(0);
  }

  async function signal(signal: 'SIGINT' | 'SIGTERM' = 'SIGTERM') {
    process.emit(signal);

    const result = await worker;

    expect(result).toEqual(new Error('exit:0'));
  }

  function expectWorkerCleanup() {
    expect(process.listenerCount('SIGINT')).toBe(listeners.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(listeners.SIGTERM);
    expect(vi.getTimerCount()).toBe(0);
  }

  beforeEach(() => {
    resetFrogbotCache();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
    vi.stubEnv('NODE_ENV', 'production');

    mocks.payload = makePayload();

    vi.spyOn(BasePayload.prototype, 'init').mockImplementation(async function (
      this: BasePayload,
      options,
    ) {
      const initialize = mocks.payload.init;

      Object.assign(this, mocks.payload);
      mocks.payload = this as unknown as ReturnType<typeof makePayload>;

      await initialize(options);

      return this;
    });

    onInit = vi.fn(async (_frogbot: Frogbot) => undefined);

    payloadConfig = {
      jobs: { autoRun: [{ cron: '* * * * * *', allQueues: true }] },
    } as SanitizedConfig;

    config = {
      collections: [],
      connections: [],
      _internal: {
        payloadConfig: Promise.resolve(payloadConfig),
        noEmail: true,
        triggers: {},
      },
      onInit,
    } as unknown as FrogbotSanitizedConfig;

    mocks.loadConfig.mockReset().mockResolvedValue(config);

    exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    listeners = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    };
  });

  afterEach(async () => {
    if (worker && process.listenerCount('SIGTERM') > listeners.SIGTERM) process.emit('SIGTERM');

    await worker;

    worker = undefined;
    resetFrogbotCache();

    expectWorkerCleanup();

    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('boots the real FrogBot runtime, retains app initialization, and passes it to tasks', async () => {
    let initialized = false;

    onInit.mockImplementation(async (frogbot: Frogbot) => {
      expect(frogbot).toBeInstanceOf(Frogbot);

      initialized = true;
    });

    mocks.payload.init.mockImplementation(async () => {
      expect(payloadConfig.jobs.autoRun).toEqual([]);
      expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
    });

    mocks.payload.jobs.run.mockImplementation(async (args) => {
      const { req } = args as { req: PayloadRequest & { frogbot: Frogbot } };

      expect(initialized).toBe(true);
      expect(req.frogbot).toBe(onInit.mock.calls[0][0]);
      expect(req.frogbot.jobs).toBe(mocks.payload.jobs);
      expect(req.payload).toBe(mocks.payload);
      expect(req.payload).toBeInstanceOf(BasePayload);
      expect(getCachedFrogbot()).toBe(req.frogbot);
      expect((await createDefaultRequest()).frogbot).toBe(req.frogbot);
    });

    await start([]);

    expect(mocks.payload.jobs.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.payload.init).toHaveBeenCalledWith({
      config: payloadConfig,
      cron: false,
      disableOnInit: true,
    });
    expect(mocks.payload.jobs.run).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, queue: 'default', allQueues: false }),
    );
    expect(mocks.payload.jobs.handleSchedules).not.toHaveBeenCalled();

    await signal();

    expect(mocks.payload.destroy).toHaveBeenCalledOnce();
  });

  it('handles schedules before claiming jobs with the same queue and request', async () => {
    const order: string[] = [];

    mocks.payload.jobs.handleSchedules.mockImplementation(async () => {
      order.push('schedule');
    });

    mocks.payload.jobs.run.mockImplementation(async () => {
      order.push('run');
    });

    await start(['--cron=* * * * * *', '--handle-schedules', '--queue=mail', '--limit=6']);
    await vi.advanceTimersByTimeAsync(1000);

    expect(order).toEqual(['schedule', 'run']);

    const scheduleArgs = mocks.payload.jobs.handleSchedules.mock.calls[0][0];

    expect(mocks.payload.jobs.run).toHaveBeenCalledWith({ ...(scheduleArgs as object), limit: 6 });
    expect(scheduleArgs).toMatchObject({ queue: 'mail', allQueues: false });

    await signal();
  });

  it.each([false, true])('limit zero never claims jobs (scheduling=%s)', async (scheduling) => {
    await start([
      '--cron=* * * * * *',
      '--limit=0',
      '--all-queues',
      ...(scheduling ? ['--handle-schedules'] : []),
    ]);

    await vi.advanceTimersByTimeAsync(2000);

    expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
    expect(mocks.payload.jobs.handleSchedules).toHaveBeenCalledTimes(scheduling ? 2 : 0);

    if (scheduling) {
      expect(mocks.payload.jobs.handleSchedules).toHaveBeenCalledWith(
        expect.objectContaining({ allQueues: true, queue: undefined }),
      );
    }

    await signal();
  });

  it('skips overlapping ticks across scheduling and job execution', async () => {
    const scheduling = deferred();
    const running = deferred();

    mocks.payload.jobs.handleSchedules.mockImplementation(() => scheduling.promise);
    mocks.payload.jobs.run.mockImplementation(() => running.promise);

    await start(['--cron=* * * * * *', '--handle-schedules']);
    await vi.advanceTimersByTimeAsync(3000);

    expect(mocks.payload.jobs.handleSchedules).toHaveBeenCalledOnce();
    expect(mocks.payload.jobs.run).not.toHaveBeenCalled();

    scheduling.resolve();
    await vi.advanceTimersByTimeAsync(3000);

    expect(mocks.payload.jobs.run).toHaveBeenCalledOnce();
    expect(mocks.payload.jobs.handleSchedules).toHaveBeenCalledOnce();

    running.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.payload.jobs.run).toHaveBeenCalledTimes(2);

    await signal();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'drains active jobs and actual lease renewal on %s',
    async (shutdownSignal) => {
      const running = deferred();
      const renewal = deferred();

      mocks.payload.db[jobLeaseOperations].update.mockImplementation(() => renewal.promise);
      mocks.payload.jobs.run.mockImplementation(async (args) =>
        withJobLease({
          payload: mocks.payload as unknown as Payload,
          req: (args as { req: PayloadRequest }).req,
          leaseDuration: 5000,
          run: async () => {
            recordJobClaims([1]);

            await running.promise;
          },
        }),
      );

      await start();
      await vi.advanceTimersByTimeAsync(2000);

      process.emit(shutdownSignal);
      process.emit(shutdownSignal);
      await vi.advanceTimersByTimeAsync(2000);

      expect(mocks.payload.jobs.run).toHaveBeenCalledOnce();
      expect(mocks.payload.db[jobLeaseOperations].update).toHaveBeenCalledOnce();
      expect(mocks.payload.destroy).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();

      running.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect(mocks.payload.destroy).not.toHaveBeenCalled();

      renewal.resolve();

      expect(await worker).toEqual(new Error('exit:0'));
      expect(mocks.payload.destroy).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledOnce();
    },
  );

  it('drains scheduling on signal without starting another batch', async () => {
    const scheduling = deferred();

    mocks.payload.jobs.handleSchedules.mockImplementation(() => scheduling.promise);

    await start(['--cron=* * * * * *', '--handle-schedules']);
    await vi.advanceTimersByTimeAsync(1000);

    process.emit('SIGTERM');

    expect(mocks.payload.destroy).not.toHaveBeenCalled();

    scheduling.resolve();

    expect(await worker).toEqual(new Error('exit:0'));
    expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
  });

  it.each(['handleSchedules', 'run'] as const)(
    'cleans up and exits 1 after %s fails',
    async (method) => {
      mocks.payload.jobs[method].mockRejectedValue(new Error(`${method} failure`));

      await start(['--cron=* * * * * *', '--handle-schedules']);
      await vi.advanceTimersByTimeAsync(1000);

      expect(await worker).toEqual(new Error('exit:1'));
      expect(error).toHaveBeenCalledWith(`FrogBot jobs:run failed: ${method} failure`);
      expect(mocks.payload.destroy).toHaveBeenCalledOnce();

      if (method === 'handleSchedules') expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
    },
  );

  it.each(['config', 'database', 'application'] as const)(
    'handles %s initialization failure',
    async (phase) => {
      const failure = new Error(`${phase} failure`);

      if (phase === 'config') mocks.loadConfig.mockRejectedValue(failure);

      if (phase === 'database') mocks.payload.init.mockRejectedValue(failure);

      if (phase === 'application') onInit.mockRejectedValue(failure);

      worker = jobsRun([]).catch((error: unknown) => error);

      expect(await worker).toEqual(new Error('exit:1'));
      expect(error).toHaveBeenCalledWith(`FrogBot jobs:run failed: ${phase} failure`);
      expect(mocks.payload.destroy).toHaveBeenCalledTimes(phase === 'config' ? 0 : 1);
      expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
    },
  );

  it('waits for initialization to settle when signalled during boot', async () => {
    const initializing = deferred();

    mocks.payload.init.mockImplementation(() => initializing.promise);

    worker = jobsRun([]).catch((error: unknown) => error);

    await vi.waitFor(() => expect(mocks.payload.init).toHaveBeenCalledOnce());

    process.emit('SIGTERM');

    expect(mocks.payload.destroy).not.toHaveBeenCalled();

    initializing.resolve();

    expect(await worker).toEqual(new Error('exit:0'));
    expect(onInit).not.toHaveBeenCalled();
    expect(mocks.payload.destroy).toHaveBeenCalledOnce();
  });

  it('drains application initialization before closing the database', async () => {
    const initializing = deferred();

    onInit.mockImplementation(() => initializing.promise);

    worker = jobsRun(['--cron=* * * * * *']).catch((error: unknown) => error);

    await vi.waitFor(() => expect(onInit).toHaveBeenCalledOnce());

    process.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(3000);

    expect(mocks.payload.destroy).not.toHaveBeenCalled();
    expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
    expect(getCachedFrogbot()).toBeNull();

    initializing.resolve();

    expect(await worker).toEqual(new Error('exit:0'));
    expect(mocks.payload.destroy).toHaveBeenCalledOnce();
  });

  it('does not open a database after a signal received while loading configuration', async () => {
    const loading = deferred();

    mocks.loadConfig.mockImplementation(async () => {
      await loading.promise;

      return config;
    });

    worker = jobsRun([]).catch((error: unknown) => error);
    process.emit('SIGTERM');
    loading.resolve();

    expect(await worker).toEqual(new Error('exit:0'));
    expect(mocks.payload.init).not.toHaveBeenCalled();
    expect(mocks.payload.destroy).not.toHaveBeenCalled();
  });

  it('closes the runtime if request creation fails', async () => {
    await start();

    const frogbot = onInit.mock.calls[0][0] as Frogbot;

    vi.spyOn(frogbot, 'createRequest').mockRejectedValue(new Error('request failure'));

    await vi.advanceTimersByTimeAsync(1000);

    expect(await worker).toEqual(new Error('exit:1'));
    expect(mocks.payload.jobs.run).not.toHaveBeenCalled();
    expect(mocks.payload.destroy).toHaveBeenCalledOnce();
  });

  it('keeps signal handlers installed until cleanup finishes and reports cleanup failure', async () => {
    const destroying = deferred();

    mocks.payload.destroy.mockImplementation(async () => {
      await destroying.promise;

      throw new Error('cleanup failure');
    });

    await start();

    process.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(0);
    process.emit('SIGINT');

    expect(exit).not.toHaveBeenCalled();

    destroying.resolve();

    expect(await worker).toEqual(new Error('exit:1'));
    expect(mocks.payload.destroy).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('FrogBot jobs:run failed: cleanup failure');
  });

  it.each([['--help'], ['--limit=-1'], ['--cron=invalid']])(
    'handles %j without initializing resources',
    async (arg) => {
      const code = arg === '--help' ? 0 : 2;

      await expect(jobsRun([arg])).rejects.toThrow(`exit:${code}`);

      expect(mocks.loadConfig).not.toHaveBeenCalled();
      expect(mocks.payload.init).not.toHaveBeenCalled();
      expect(mocks.payload.destroy).not.toHaveBeenCalled();
    },
  );
});

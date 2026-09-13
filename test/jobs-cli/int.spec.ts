import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { startWorker } from './worker.js';

const workers: Awaited<ReturnType<typeof startWorker>>[] = [];
const cron = ['--cron', '* * * * * *'];

async function launch(options: Parameters<typeof startWorker>[0]) {
  const worker = await startWorker(options);

  workers.push(worker);

  return worker;
}

async function assertBoot(worker: Awaited<ReturnType<typeof startWorker>>) {
  const boot = await worker.message('booted');

  expect(boot).toMatchObject({
    runtimeReady: true,
    configuredAutorun: 1,
    activeAutorun: 0,
  });

  return boot;
}

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.cleanup()));
});

describe('normal jobs:run executable with a real SQLite app', () => {
  it('executes every selected job once across limited batches and leaves another queue pending', async () => {
    const worker = await launch({ args: [...cron, '--queue', 'work', '--limit', '2'] });
    const boot = await assertBoot(worker);

    await worker.message('handler-started', 3);
    await expect
      .poll(() => worker.jobs().filter((job) => job.completed_at).length, { timeout: 10_000 })
      .toBe(3);

    expect(worker.child.kill('SIGTERM')).toBe(true);
    expect(await worker.exit(), worker.output()).toEqual({ code: 0, signal: null });

    const jobs = worker.jobs();
    const selected = jobs.filter((job) => job.queue === 'work');

    expect(selected.map((job) => job.id)).toEqual(boot.ids);
    expect(selected).toHaveLength(3);

    for (const job of selected) {
      expect(job).toMatchObject({ processing: 0, total_tried: 1 });
      expect(job.completed_at).toEqual(expect.any(String));
    }

    expect(jobs.find((job) => job.id === boot.other)).toMatchObject({
      processing: 0,
      completed_at: null,
      total_tried: 0,
    });
    expect(worker.executions()).toEqual(
      expect.arrayContaining(boot.ids!.map((id) => ({ job: String(id), runtime_ready: 1 }))),
    );
    expect(worker.executions()).toHaveLength(3);
    expect(worker.messages.filter((message) => message.type === 'autorun-called')).toEqual([]);
  });

  it('schedules with limit zero without claiming queued work or enabling configured autorun', async () => {
    const worker = await launch({
      args: [...cron, '--all-queues', '--handle-schedules', '--limit', '0'],
    });

    await assertBoot(worker);
    await worker.message('schedule-observed', 2);

    expect(worker.child.kill('SIGTERM')).toBe(true);
    expect(await worker.exit(), worker.output()).toEqual({ code: 0, signal: null });

    const jobs = worker.jobs();

    expect(jobs.some((job) => job.task_slug === 'cli-scheduled')).toBe(true);
    expect(jobs.filter((job) => job.task_slug === 'cli-work')).toHaveLength(4);

    for (const job of jobs) {
      expect(job).toMatchObject({
        processing: 0,
        completed_at: null,
        total_tried: 0,
        lease_owner: null,
        lease_until: null,
      });
    }

    expect(worker.executions()).toEqual([]);
    expect(worker.messages.filter((message) => message.type.endsWith('handler-started'))).toEqual(
      [],
    );
    expect(worker.messages.filter((message) => message.type === 'autorun-called')).toEqual([]);
  });

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'drains a blocked handler on %s and persists completion before exit zero',
    async (signal) => {
      const worker = await launch({
        args: [...cron, '--queue', 'work', '--limit', '1'],
        scenario: 'drain',
      });

      await assertBoot(worker);

      const started = await worker.message('handler-started');
      const claimed = worker.jobs().find((job) => job.id === started.id);

      expect(started.runtimeReady).toBe(true);
      expect(claimed).toMatchObject({ processing: 1, completed_at: null });
      expect(claimed?.lease_owner).toEqual(expect.any(String));
      expect(claimed?.lease_until).toEqual(expect.any(String));

      expect(worker.child.kill(signal)).toBe(true);

      await worker.message(`${signal.toLowerCase()}-observed`);
      await worker.send('ping');
      await worker.message('pong');

      expect(worker.child.exitCode).toBeNull();
      expect(worker.jobs().find((job) => job.id === started.id)?.completed_at).toBeNull();

      await worker.send('release-handler');

      expect(await worker.exit(), worker.output()).toEqual({ code: 0, signal: null });

      const jobs = worker.jobs();
      const completed = jobs.find((job) => job.id === started.id);

      expect(completed).toMatchObject({ processing: 0, total_tried: 1 });
      expect(completed?.completed_at).toEqual(expect.any(String));
      expect(worker.executions()).toEqual([{ job: String(started.id), runtime_ready: 1 }]);
      expect(jobs.filter((job) => job.id !== started.id)).toHaveLength(2);

      for (const job of jobs.filter((job) => job.id !== started.id)) {
        expect(job).toMatchObject({ processing: 0, completed_at: null, total_tried: 0 });
      }
    },
  );

  it('rejects a negative limit with exit two before trying to load an invalid app path', async () => {
    const worker = await launch({
      args: ['--limit', '-1'],
      configPath: '/frogbot-jobs-cli-missing/frogbot.config.mjs',
    });

    expect(await worker.exit(), worker.output()).toEqual({ code: 2, signal: null });
    expect(worker.output()).toContain('--limit');
    expect(worker.output()).not.toContain('failed to load');
    expect(worker.messages).toEqual([]);
    expect(existsSync(worker.databasePath)).toBe(false);
  });
});

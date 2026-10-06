import type { Job, PayloadRequest, RequestContext } from 'payload';
import { assert, describe, expect, it, vi } from 'vitest';

import { resolveScheduleTasks } from '../../../../packages/frogbot/src/agents/resolveScheduleTasks.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';
import {
  AGENT_TRIGGER_TASK_SLUG,
  resolveTriggerTasks,
} from '../../../../packages/frogbot/src/triggers/task.js';
import { createEchoPiece } from './fixtures/piece-echo.js';

describe('agent trigger task', () => {
  it('installs an automatic all-queues runner for trigger-only configs', () => {
    expect(resolveTriggerTasks().autoRun).toEqual([{ allQueues: true, cron: '* * * * *' }]);
  });

  it('preserves user tasks and runners', async () => {
    const task = { slug: 'custom', handler: vi.fn() };
    const runner = { queue: 'custom', cron: '*/5 * * * *' };
    const jobs = resolveTriggerTasks({ tasks: [task], autoRun: [runner] });
    expect(jobs.tasks).toContain(task);
    expect(jobs.autoRun).toEqual([runner, { allQueues: true, cron: '* * * * *' }]);
    const autoRun = vi.fn().mockResolvedValue([runner]);
    const dynamic = resolveTriggerTasks({ autoRun }).autoRun;
    expect(typeof dynamic).toBe('function');
    const payload = {};
    expect(await (dynamic as typeof autoRun)(payload)).toEqual([
      runner,
      { allQueues: true, cron: '* * * * *' },
    ]);
    expect(autoRun).toHaveBeenCalledWith(payload);
  });

  it.each([false, true])('reuses the schedule runner (dynamic: %s)', async (dynamic) => {
    const runner = { queue: 'custom', cron: '*/5 * * * *' };
    const jobs = resolveScheduleTasks({
      agents: [
        {
          slug: 'ops',
          triggers: [{ type: 'schedule', slug: 'tick', schedule: { every: '1m' }, prompt: 'tick' }],
        },
      ] as never,
      jobs: { autoRun: dynamic ? () => Promise.resolve([runner]) : [runner] },
    });
    const resolved = resolveTriggerTasks(jobs);
    expect(resolved.autoRun).toBe(jobs!.autoRun);
    const runners =
      typeof resolved.autoRun === 'function'
        ? await resolved.autoRun({} as never)
        : resolved.autoRun;
    expect(runners).toEqual([runner, { allQueues: true, cron: '* * * * *' }]);
  });

  it('delivers event data and a trigger request to the addressed handler', async () => {
    const payload = {};
    const instance = createEchoPiece({ prefix: 'echo: ' });
    const handler = vi.fn();
    const configured = { trigger: instance.triggers.received, handler };
    const agent = { slug: 'ops', config: { triggers: [configured] } };
    const createRequest = vi.fn();
    const frogbot = {
      agents: { ops: agent },
      createRequest,
      config: {
        _internal: {
          triggers: {
            echo: { instance, subscribers: [{ agentSlug: 'ops', trigger: configured }] },
          },
        },
      },
    };
    createRequest.mockImplementation(({ context }) => Promise.resolve({ context, frogbot }));
    registerFrogBotInstance(payload, frogbot as never);
    const task = resolveTriggerTasks().tasks!.find(({ slug }) => slug === AGENT_TRIGGER_TASK_SLUG)!;
    assert(typeof task.handler === 'function');
    const context: RequestContext = { requestId: 'one' };
    const job: Job<string> = {
      id: 1,
      input: {},
      taskStatus: {},
      totalTried: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await task.handler({
      input: {
        agentSlug: 'ops',
        instanceSlug: 'echo',
        triggerSlug: 'received',
        event: { dedupeKey: 'one', data: { message: 'hello' } },
      },
      req: { payload, context } as PayloadRequest,
      job,
      inlineTask: vi.fn(),
      tasks: {},
    });
    expect(handler).toHaveBeenCalledWith({
      event: { message: 'hello' },
      agent,
      req: expect.objectContaining({
        frogbot,
        context: {
          requestId: 'one',
          trigger: { piece: 'echo', trigger: 'received', agent: 'ops' },
        },
      }),
    });
  });
});

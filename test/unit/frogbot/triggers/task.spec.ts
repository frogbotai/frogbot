import type { Job, PayloadRequest, RequestContext } from 'payload';
import { assert, describe, expect, it, vi } from 'vitest';

import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';
import {
  AGENT_TRIGGER_TASK_SLUG,
  resolveTriggerTasks,
} from '../../../../packages/frogbot/src/triggers/task.js';
import { createEchoPiece } from './fixtures/createEchoPiece.js';

describe('agent trigger task', () => {
  it('adds its task and leaves the runners to sanitize', () => {
    const task = { slug: 'custom', handler: vi.fn() };
    const runner = { queue: 'custom', cron: '*/5 * * * *' };
    const jobs = resolveTriggerTasks({ tasks: [task], autoRun: [runner] });

    expect(jobs.tasks?.map(({ slug }) => slug)).toEqual(['custom', AGENT_TRIGGER_TASK_SLUG]);
    expect(jobs.autoRun).toEqual([runner]);
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

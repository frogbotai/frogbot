import type { TaskConfig } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentConfig } from '../../../../packages/frogbot/src/agents/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import {
  resolvePollTasks,
  TRIGGER_POLL_TASK_SLUG,
} from '../../../../packages/frogbot/src/triggers/poll.js';
import { buildIngressRegistry } from '../../../../packages/frogbot/src/triggers/registry.js';
import { createEchoPiece } from './fixtures/createEchoPiece.js';

const polling = definePiece({
  slug: 'polling',
  label: 'Polling',
  actions: [],
  triggers: [
    {
      slug: 'polled',
      type: 'polling',
      description: 'Polled',
      input: z.object({}),
      run: () => Promise.resolve({ events: [] }),
    },
  ],
})();

function task(jobs: ReturnType<typeof resolvePollTasks>): TaskConfig {
  return jobs!.tasks!.find(({ slug }) => slug === TRIGGER_POLL_TASK_SLUG)!;
}

describe('resolvePollTasks', () => {
  it('schedules each polling mount on its own queue', async () => {
    const userTask = { slug: 'user-task', handler: vi.fn() } as TaskConfig;
    const agents: AgentConfig[] = [
      {
        slug: 'inbox',
        instructions: 'Poll',
        triggers: [{ trigger: polling.triggers.polled, handler: vi.fn() }],
      },
      {
        slug: 'hourly',
        instructions: 'Poll',
        triggers: [
          { trigger: polling.triggers.polled, schedule: { every: '1h' }, handler: vi.fn() },
        ],
      },
    ];

    const jobs = resolvePollTasks({
      registry: buildIngressRegistry({ agents }),
      jobs: { tasks: [userTask], autoRun: [{ queue: 'user' }] },
    });

    expect(jobs?.tasks?.[0]).toBe(userTask);
    expect(jobs?.autoRun).toEqual([{ queue: 'user' }]);
    expect(task(jobs).schedule?.map(({ cron, queue }) => ({ cron, queue }))).toEqual([
      { cron: '*/5 * * * *', queue: 'frogbot-poll:inbox:polling:polled' },
      { cron: '0 */1 * * *', queue: 'frogbot-poll:hourly:polling:polled' },
    ]);

    const defaultBeforeSchedule = vi
      .fn()
      .mockResolvedValue({ input: {}, shouldSchedule: false, waitUntil: new Date(0) });

    await expect(
      task(jobs).schedule![1].hooks!.beforeSchedule!({
        defaultBeforeSchedule,
        jobStats: {},
        queueable: {} as never,
        req: {} as never,
      }),
    ).resolves.toEqual({
      input: { agentSlug: 'hourly', instanceSlug: 'polling', triggerSlug: 'polled' },
      shouldSchedule: false,
      waitUntil: new Date(0),
    });
  });

  it('adds no task when nothing polls', () => {
    const echo = createEchoPiece({ prefix: 'echo: ' });
    const jobs = { tasks: [] };
    const registry = buildIngressRegistry({
      agents: [
        {
          slug: 'ops',
          instructions: 'Handle events',
          triggers: [
            { trigger: echo.triggers.subscribed, input: { channel: 'ops' }, handler: vi.fn() },
          ],
        },
      ],
    });

    expect(resolvePollTasks({ registry, jobs })).toBe(jobs);
  });
});

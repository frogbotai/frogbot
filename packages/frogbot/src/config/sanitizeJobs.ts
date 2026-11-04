import type { JobsConfig } from 'payload';

import { assertCron } from '../agents/resolveScheduleTasks.js';
import { ConfigIssueError } from './issue.js';

function assertSchedules(
  kind: 'tasks' | 'workflows',
  slug: string,
  schedule: { cron: string }[] | undefined,
): void {
  const label = kind === 'tasks' ? 'Task' : 'Workflow';

  for (const [index, { cron }] of (schedule ?? []).entries()) {
    try {
      assertCron(cron, `${label} '${slug}' schedule ${index}`);
    } catch (cause) {
      throw new ConfigIssueError(
        {
          code: 'INVALID_CRON',
          message: (cause as Error).message,
          path: `jobs.${kind}.${slug}.schedule.${index}.cron`,
        },
        { cause },
      );
    }
  }
}

/** Checks every task and workflow schedule cron, and that WorkflowJSON steps name a known task. */
export function assertJobs(jobs: JobsConfig | undefined): void {
  const taskSlugs = new Set(jobs?.tasks?.map(({ slug }) => slug));

  for (const task of jobs?.tasks ?? []) assertSchedules('tasks', task.slug, task.schedule);

  for (const workflow of jobs?.workflows ?? []) {
    assertSchedules('workflows', workflow.slug, workflow.schedule);

    if (!Array.isArray(workflow.handler)) continue;

    for (const [index, step] of workflow.handler.entries()) {
      if (!('task' in step) || taskSlugs.has(step.task)) continue;

      throw new ConfigIssueError({
        code: 'UNKNOWN_TASK',
        message: `[frogbot] Workflow '${workflow.slug}' step '${step.id}' names task '${String(step.task)}', which isn't in jobs.tasks.`,
        path: `jobs.workflows.${workflow.slug}.handler.${index}.task`,
      });
    }
  }
}

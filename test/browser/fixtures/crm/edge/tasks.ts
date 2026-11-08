import type { Seeded } from '../seed';
import { cycle, la, longTitle } from '../shared';

const STATUSES = ['todo', 'in-progress', 'waiting', 'done'] as const;

const PRIORITIES = ['low', 'medium', 'high'] as const;

/** 26 tasks: completed ones in each status, a 200-character title, one with no optional fields, and 20 more. */
export async function seedTasks({ frogbot, owner, deals }: Seeded) {
  const dealIds = [...deals.values()];

  const create = (data: Parameters<typeof frogbot.create<'tasks'>>[0]['data']) =>
    frogbot.create({ collection: 'tasks', data, overrideAccess: true });

  for (const [index, status] of STATUSES.entries()) {
    await create({
      title: `Completed while ${status}`,
      status,
      completed: true,
      dueDate: la(index - 2, 12),
      assignee: owner,
    });
  }

  await create({
    title: longTitle('Long title task'),
    status: 'in-progress',
    priority: 'high',
    dueDate: la(2, 12),
    assignee: owner,
  });

  await create({ title: 'Minimal task' });

  for (let index = 0; index < 20; index++) {
    await create({
      title: `${cycle(['Follow up', 'Send contract', 'Update forecast', 'Call back'], index)} #${index + 1}`,
      status: cycle(STATUSES, index),
      priority: cycle(PRIORITIES, index),
      dueDate: la(-10 + index, 12),
      deal: cycle(dealIds, index),
      assignee: owner,
    });
  }
}

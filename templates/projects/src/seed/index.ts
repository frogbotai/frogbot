import type { FrogBotInstance, FrogBotRequest } from 'frogbot';

export const DEMO_EMAIL = 'admin@test.com';

export const DEMO_PASSWORD = 'password';

type TaskStatus = 'todo' | 'in-progress' | 'in-review' | 'done';

type SampleProject = {
  key: string;
  name: string;
  description: string;
  status: 'planned' | 'active' | 'done';
  tasks: Array<{ title: string; status: TaskStatus; dueInDays?: number }>;
};

const PROJECTS: SampleProject[] = [
  {
    key: 'WEB',
    name: 'Website relaunch',
    description:
      'A new marketing site with a faster homepage and a clearer pricing page.',
    status: 'active',
    tasks: [
      { title: 'Write the homepage copy', status: 'done', dueInDays: -5 },
      { title: 'Design the pricing page', status: 'in-review', dueInDays: 2 },
      {
        title: 'Move the blog to the new layout',
        status: 'in-progress',
        dueInDays: 6,
      },
      {
        title: 'Set up redirects from the old URLs',
        status: 'todo',
        dueInDays: 10,
      },
      { title: 'Run a performance audit', status: 'todo', dueInDays: 14 },
    ],
  },
  {
    key: 'MOB',
    name: 'Mobile app beta',
    description: 'A first beta of the iOS and Android app for early customers.',
    status: 'active',
    tasks: [
      { title: 'Build the sign-in screen', status: 'done', dueInDays: -9 },
      { title: 'Add push notifications', status: 'in-progress', dueInDays: 4 },
      { title: 'Invite the first beta testers', status: 'todo', dueInDays: 12 },
      {
        title: 'Fix the offline sync crash',
        status: 'in-review',
        dueInDays: 1,
      },
    ],
  },
  {
    key: 'OPS',
    name: 'Support handbook',
    description:
      'One place for support replies, escalation rules and on-call notes.',
    status: 'planned',
    tasks: [
      {
        title: 'List the top ten support questions',
        status: 'todo',
        dueInDays: 7,
      },
      { title: 'Write the escalation guide', status: 'todo', dueInDays: 21 },
      {
        title: 'Choose a tool for the handbook',
        status: 'done',
        dueInDays: -2,
      },
    ],
  },
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Replaces every project and task with sample data, and recreates the demo user
 * `admin@test.com` / `password` unless it is the signed-in user.
 */
export async function seed({
  frogbot,
  req,
}: {
  frogbot: FrogBotInstance;
  req: FrogBotRequest;
}) {
  await frogbot.delete({
    collection: 'tasks',
    where: {},
    overrideAccess: true,
    req,
  });

  await frogbot.delete({
    collection: 'projects',
    where: {},
    overrideAccess: true,
    req,
  });

  const demoUser = await recreateDemoUser({ frogbot, req });
  const assignees = [demoUser.id, req.user?.id ?? demoUser.id];
  let index = 0;

  for (const { tasks, ...data } of PROJECTS) {
    const project = await frogbot.create({
      collection: 'projects',
      data,
      overrideAccess: true,
      req,
    });

    for (const { dueInDays, ...task } of tasks) {
      await frogbot.create({
        collection: 'tasks',
        data: {
          ...task,
          project: project.id,
          assignee: assignees[index % assignees.length],
          dueDate:
            dueInDays === undefined
              ? undefined
              : new Date(Date.now() + dueInDays * DAY).toISOString(),
        },
        overrideAccess: true,
        req,
      });

      index++;
    }
  }
}

async function recreateDemoUser({
  frogbot,
  req,
}: {
  frogbot: FrogBotInstance;
  req: FrogBotRequest;
}) {
  if (req.user?.email === DEMO_EMAIL) return req.user;

  await frogbot.delete({
    collection: 'users',
    where: { email: { equals: DEMO_EMAIL } },
    overrideAccess: true,
    req,
  });

  return frogbot.create({
    collection: 'users',
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo Admin' },
    overrideAccess: true,
    req,
  });
}

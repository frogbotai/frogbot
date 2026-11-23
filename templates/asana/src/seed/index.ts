import type { FrogBotRequest } from 'frogbot';

type TaskStatus = 'todo' | 'in-progress' | 'in-review' | 'done';

type SampleProject = {
  key: string;
  name: string;
  description: string;
  status: 'planned' | 'active' | 'done';
  tasks: Array<{
    title: string;
    status: TaskStatus;
    startInDays?: number;
    dueInDays?: number;
    subtasks?: Array<{ title: string; completed?: boolean }>;
    attachment?: { name: string; text: string };
    comments?: string[];
  }>;
};

const PROJECTS: SampleProject[] = [
  {
    key: 'WEB',
    name: 'Website relaunch',
    description:
      'A new marketing site with a faster homepage and a clearer pricing page.',
    status: 'active',
    tasks: [
      {
        title: 'Write the homepage copy',
        status: 'done',
        startInDays: -12,
        dueInDays: -5,
      },
      {
        title: 'Design the pricing page',
        status: 'in-review',
        startInDays: -4,
        dueInDays: 2,
        subtasks: [
          { title: 'Sketch the plan comparison table', completed: true },
          { title: 'Write the pricing FAQ' },
        ],
        attachment: {
          name: 'pricing-notes.txt',
          text: 'Three plans: Free, Team and Business. Annual billing saves two months.\n',
        },
        comments: [
          'The comparison table is ready for review.',
          'Can we show annual prices by default?',
        ],
      },
      {
        title: 'Move the blog to the new layout',
        status: 'in-progress',
        startInDays: -1,
        dueInDays: 6,
      },
      {
        title: 'Set up redirects from the old URLs',
        status: 'todo',
        startInDays: 7,
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
      {
        title: 'Build the sign-in screen',
        status: 'done',
        startInDays: -16,
        dueInDays: -9,
      },
      {
        title: 'Add push notifications',
        status: 'in-progress',
        startInDays: -3,
        dueInDays: 4,
      },
      {
        title: 'Invite the first beta testers',
        status: 'todo',
        startInDays: 8,
        dueInDays: 12,
      },
      {
        title: 'Fix the offline sync crash',
        status: 'in-review',
        startInDays: -2,
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
        startInDays: 3,
        dueInDays: 7,
      },
      {
        title: 'Write the escalation guide',
        status: 'todo',
        startInDays: 9,
        dueInDays: 21,
      },
      {
        title: 'Choose a tool for the handbook',
        status: 'done',
        dueInDays: -2,
      },
    ],
  },
];

const DAY = 24 * 60 * 60 * 1000;

function paragraph(text: string) {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text, version: 1 }],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  };
}

function daysFrom(today: Date, days: number | undefined): string | undefined {
  return days === undefined
    ? undefined
    : new Date(today.getTime() + days * DAY).toISOString();
}

/** Whether the app already has the starter's records; Seed only fills an empty app. */
export async function hasSampleData({
  req,
}: {
  req: FrogBotRequest;
}): Promise<boolean> {
  const { totalDocs } = await req.frogbot.count({
    collection: 'projects',
    overrideAccess: true,
    req,
  });

  return totalDocs > 0;
}

/**
 * Adds three sample projects with tasks, every task assigned to the signed-in user and dated
 * around `today` (default: now), plus subtasks, an attachment and comments on one task. It creates
 * no user, and the endpoint runs it only on an app with no projects. If it fails partway it
 * deletes what it added, so the app is empty again and Seed can be retried.
 */
export async function seed({
  req,
  today = new Date(),
}: {
  req: FrogBotRequest;
  today?: Date;
}) {
  const assignee = req.user?.id;
  const created: Array<number | string> = [];
  const files: Array<number | string> = [];
  const options = { overrideAccess: true, req };

  try {
    for (const { tasks, ...data } of PROJECTS) {
      const project = await req.frogbot.create({
        collection: 'projects',
        data,
        overrideAccess: true,
        req,
      });

      created.push(project.id);

      for (const {
        attachment,
        comments = [],
        dueInDays,
        startInDays,
        subtasks = [],
        ...task
      } of tasks) {
        const file = attachment
          ? await req.frogbot.create({
              collection: 'files',
              data: {},
              file: {
                data: Buffer.from(attachment.text),
                mimetype: 'text/plain',
                name: attachment.name,
                size: Buffer.byteLength(attachment.text),
              },
              ...options,
            })
          : undefined;

        if (file) files.push(file.id);

        const parent = await req.frogbot.create({
          collection: 'tasks',
          data: {
            ...task,
            project: project.id,
            assignee,
            startDate: daysFrom(today, startInDays),
            dueDate: daysFrom(today, dueInDays),
            attachments: file ? [file.id] : [],
          },
          ...options,
        });

        for (const subtask of subtasks) {
          await req.frogbot.create({
            collection: 'tasks',
            data: { ...subtask, parent: parent.id, assignee },
            ...options,
          });
        }

        for (const text of comments) {
          await req.frogbot.create({
            collection: 'comments',
            data: {
              body: paragraph(text),
              collection: 'tasks',
              documentId: String(parent.id),
            },
            ...options,
          });
        }
      }
    }
  } catch (err) {
    if (created.length > 0) {
      const project = { in: created };

      await req.frogbot.delete({
        collection: 'tasks',
        where: { project },
        overrideAccess: true,
        req,
      });

      await req.frogbot.delete({
        collection: 'projects',
        where: { id: project },
        overrideAccess: true,
        req,
      });
    }

    if (files.length > 0) {
      await req.frogbot.delete({
        collection: 'files',
        where: { id: { in: files } },
        ...options,
      });
    }

    throw err;
  }
}

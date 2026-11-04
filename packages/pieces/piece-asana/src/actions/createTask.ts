import { z } from 'zod';

import { type AsanaClient, signal } from '../client.js';
import { gid } from '../config.js';
import { defineAction } from '../define.js';
import { compact, fields, task } from '../records.js';

const tagPage = z.object({
  data: z.array(compact),
  next_page: z.object({ offset: z.string() }).nullish(),
});

async function workspaceTags(client: AsanaClient, workspaceGid: string, abort?: AbortSignal) {
  const tags: z.output<typeof compact>[] = [];
  let offset: string | undefined;

  do {
    const result = tagPage.parse(
      await client.json({
        path: `/workspaces/${workspaceGid}/tags`,
        query: { limit: 100, offset, opt_fields: ['name'] },
        signal: abort,
      }),
    );

    tags.push(...result.data);
    offset = result.next_page?.offset;
  } while (offset);

  return tags;
}

export const createTask = defineAction({
  slug: 'createTask',
  description: 'Create a task in an Asana project, with notes, a due date, tags and an assignee.',
  input: z.object({
    workspaceGid: gid('Workspace'),
    projectGid: gid('Project'),
    name: z.string().trim().min(1).meta({ label: 'Task name' }),
    notes: z.string().meta({ label: 'Description', description: "The task's plain-text notes." }),
    dueOn: z.iso.date().optional().meta({ label: 'Due date', description: 'YYYY-MM-DD.' }),
    tags: z
      .array(z.string().trim().min(1))
      .optional()
      .meta({ description: 'Tag gids or names, matched against the workspace tags.' }),
    assignee: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ description: 'A user gid, an email address, or "me".' }),
  }),
  output: task,
  idempotent: false,
  async run({ client, input, req }) {
    let tags: string[] | undefined;

    if (input.tags?.length) {
      const known = await workspaceTags(client, input.workspaceGid, signal(req));

      tags = input.tags.map((value) => {
        const match =
          known.find((tag) => tag.gid === value) ??
          known.find((tag) => tag.name?.toLowerCase() === value.toLowerCase());

        if (!match) throw new Error(`Asana workspace has no tag '${value}'.`);

        return match.gid;
      });
    }

    return client.data(task, {
      method: 'POST',
      path: '/tasks',
      query: { opt_fields: fields.task },
      body: {
        workspace: input.workspaceGid,
        projects: [input.projectGid],
        name: input.name,
        notes: input.notes,
        due_on: input.dueOn,
        assignee: input.assignee,
        tags,
      },
      signal: signal(req),
    });
  },
});

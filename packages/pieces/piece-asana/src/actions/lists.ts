import { z } from 'zod';

import { type AsanaClient, type AsanaRequest, signal } from '../client.js';
import { gid } from '../config.js';
import { defineAction } from '../define.js';
import {
  attachment,
  compact,
  customFieldSetting,
  fields,
  project,
  section,
  story,
  task,
  team,
  user,
  workspace,
} from '../records.js';

const pageInput = {
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .min(1)
    .optional()
    .meta({ description: "The previous page's nextCursor. Keep the other inputs the same." }),
};

function listOutput<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pagination: z.object({
      count: z.number(),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
      limit: z.number(),
    }),
  });
}

/** One page of an Asana list, in Notion's shape: `next_page.offset` becomes `nextCursor`. */
export async function page<T>(
  client: AsanaClient,
  item: z.ZodType<T>,
  {
    limit,
    cursor,
    ...request
  }: AsanaRequest & { limit: number; cursor?: string; signal?: AbortSignal },
) {
  const result = z
    .object({
      data: z.array(item),
      next_page: z.object({ offset: z.string() }).nullish(),
    })
    .parse(await client.json({ ...request, query: { ...request.query, limit, offset: cursor } }));

  const nextCursor = result.next_page?.offset ?? null;

  return {
    data: result.data,
    pagination: { count: result.data.length, hasMore: nextCursor !== null, nextCursor, limit },
  };
}

function listAction<
  const TSlug extends string,
  TShape extends z.ZodRawShape,
  TItem extends z.ZodType,
>({
  slug,
  description,
  input,
  item,
  optFields,
  request,
}: {
  slug: TSlug;
  description: string;
  input: TShape;
  item: TItem;
  optFields: readonly string[];
  request: (input: z.output<z.ZodObject<TShape>>) => Pick<AsanaRequest, 'path' | 'query'>;
}) {
  return defineAction({
    slug,
    description,
    input: z.object({ ...input, ...pageInput }),
    output: listOutput(item),
    idempotent: true,
    async run({ client, input: values, req }) {
      const { path, query } = request(values as z.output<z.ZodObject<TShape>>);
      const paging = values as { limit: number; cursor?: string };

      return page(client, item as z.ZodType<z.output<TItem>>, {
        path,
        query: { ...query, opt_fields: optFields },
        limit: paging.limit,
        cursor: paging.cursor,
        signal: signal(req),
      });
    },
  });
}

const workspaceGid = gid('Workspace');
const projectGid = gid('Project');
const taskGid = gid('Task');

export const listWorkspaces = listAction({
  slug: 'listWorkspaces',
  description: 'List one page of the workspaces and organizations the account belongs to.',
  input: {},
  item: workspace,
  optFields: fields.workspace,
  request: () => ({ path: '/workspaces' }),
});

export const listTeams = listAction({
  slug: 'listTeams',
  description: 'List one page of the teams in an organization.',
  input: { workspaceGid },
  item: team,
  optFields: fields.team,
  request: (input) => ({ path: `/workspaces/${input.workspaceGid}/teams` }),
});

export const listProjects = listAction({
  slug: 'listProjects',
  description:
    'List one page of the projects in a workspace, optionally only one team or only archived ones.',
  input: {
    workspaceGid,
    teamGid: gid('Team').optional(),
    archived: z
      .boolean()
      .optional()
      .meta({ description: 'true for archived projects only, false for active only.' }),
  },
  item: project,
  optFields: fields.project,
  request: (input) => ({
    path: '/projects',
    query: { workspace: input.workspaceGid, team: input.teamGid, archived: input.archived },
  }),
});

export const listSections = listAction({
  slug: 'listSections',
  description: "List one page of a project's sections, in board or list order.",
  input: { projectGid },
  item: section,
  optFields: fields.section,
  request: (input) => ({ path: `/projects/${input.projectGid}/sections` }),
});

export const listUsers = listAction({
  slug: 'listUsers',
  description: 'List one page of the users in a workspace, with their emails.',
  input: { workspaceGid },
  item: user,
  optFields: fields.user,
  request: (input) => ({ path: '/users', query: { workspace: input.workspaceGid } }),
});

export const listTasks = defineAction({
  slug: 'listTasks',
  description:
    'List one page of the top-level tasks in a project or a section, with their assignee, dates, memberships, tags and custom field values.',
  input: z
    .object({
      projectGid: projectGid.optional(),
      sectionGid: gid('Section').optional(),
      ...pageInput,
    })
    .refine((input) => (input.projectGid === undefined) !== (input.sectionGid === undefined), {
      message: 'Pass either projectGid or sectionGid.',
    }),
  output: listOutput(task),
  idempotent: true,
  async run({ client, input, req }) {
    return page(client, task, {
      path: '/tasks',
      query: { project: input.projectGid, section: input.sectionGid, opt_fields: fields.task },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});

export const listSubtasks = listAction({
  slug: 'listSubtasks',
  description: "List one page of a task's subtasks, with the same fields as listTasks.",
  input: { taskGid },
  item: task,
  optFields: fields.task,
  request: (input) => ({ path: `/tasks/${input.taskGid}/subtasks` }),
});

export const listDependencies = listAction({
  slug: 'listDependencies',
  description: 'List one page of the tasks a task depends on (is blocked by).',
  input: { taskGid },
  item: compact.extend({ completed: z.boolean().optional() }),
  optFields: fields.dependency,
  request: (input) => ({ path: `/tasks/${input.taskGid}/dependencies` }),
});

export const listCustomFields = listAction({
  slug: 'listCustomFields',
  description:
    "List one page of a project's custom field settings, each with its field's type and enum options.",
  input: { projectGid },
  item: customFieldSetting,
  optFields: fields.customFieldSetting,
  request: (input) => ({ path: `/projects/${input.projectGid}/custom_field_settings` }),
});

export const listStories = listAction({
  slug: 'listStories',
  description:
    "List one page of a task's stories: comments and system activity, told apart by resource_subtype (such as comment_added).",
  input: { taskGid },
  item: story,
  optFields: fields.story,
  request: (input) => ({ path: `/tasks/${input.taskGid}/stories` }),
});

export const listAttachments = listAction({
  slug: 'listAttachments',
  description:
    "List one page of a task's attachments. download_url lasts two minutes; use downloadAttachment to save one into FrogBot files.",
  input: { taskGid },
  item: attachment,
  optFields: fields.attachment,
  request: (input) => ({ path: '/attachments', query: { parent: input.taskGid } }),
});

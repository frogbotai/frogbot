import { z } from 'zod';

import type { JiraClient } from '../client.js';
import { issuePath } from '../records.js';

type Args = { client: JiraClient; input: Record<string, unknown> };

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const named = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
});

const searchPage = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      fields: z.object({ summary: z.string() }).partial(),
    }),
  ),
});

async function allValues<T>(client: JiraClient, path: string, item: z.ZodType<T>) {
  const page = z.object({ values: z.array(item), isLast: z.boolean().optional() });
  const values: T[] = [];

  for (let startAt = 0; ; startAt += 100) {
    const result = await client.request(page, { path, query: { startAt, maxResults: 100 } });

    values.push(...result.values);
    if (result.isLast !== false || result.values.length === 0) return values;
  }
}

export async function projectOptions({ client }: Args) {
  const projects = await allValues(
    client,
    '/project/search',
    z.object({ id: z.string(), key: z.string(), name: z.string() }),
  );

  return projects.map((project) => ({
    label: `${project.name} (${project.key})`,
    value: project.id,
  }));
}

export async function issueTypeOptions({ client, input }: Args) {
  const projectId = text(input.projectId);

  if (!projectId) return [];

  const page = z.object({ issueTypes: z.array(named) });
  const result = await client.request(page, {
    path: `/issue/createmeta/${encodeURIComponent(projectId)}/issuetypes`,
    query: { maxResults: 100 },
  });

  return result.issueTypes.map((type) => ({ label: type.name, value: type.id }));
}

/** The 100 most recently updated issues, in the chosen project when there is one. */
export async function issueOptions({ client, input }: Args) {
  const project = text(input.projectId)?.replace(/["\\]/g, '');
  const result = await client.request(searchPage, {
    method: 'POST',
    path: '/search/jql',
    body: {
      jql: `${project ? `project = "${project}" ` : ''}ORDER BY updated DESC`,
      fields: ['summary'],
      maxResults: 100,
    },
  });

  return result.issues.map((issue) => ({
    label: issue.fields.summary ? `[${issue.key}] ${issue.fields.summary}` : issue.key,
    value: issue.key,
  }));
}

export async function userOptions({ client }: Args) {
  const users = await client.request(
    z.array(
      z.object({
        accountId: z.string(),
        accountType: z.string().optional(),
        displayName: z.string(),
      }),
    ),
    { path: '/users/search', query: { maxResults: 1000 } },
  );

  return users
    .filter((user) => user.accountType === 'atlassian')
    .map((user) => ({ label: user.displayName, value: user.accountId }));
}

export async function priorityOptions({ client }: Args) {
  const priorities = await allValues(client, '/priority/search', named);

  return priorities.map((priority) => ({ label: priority.name, value: priority.id }));
}

export async function transitionOptions({ client, input }: Args) {
  const key = text(input.issueKey);

  if (!key) return [];

  const result = await client.request(z.object({ transitions: z.array(named) }), {
    path: issuePath(key, '/transitions'),
  });

  return result.transitions.map((transition) => ({ label: transition.name, value: transition.id }));
}

export async function linkTypeOptions({ client }: Args) {
  const result = await client.request(
    z.object({
      issueLinkTypes: z.array(z.object({ id: z.string(), name: z.string(), outward: z.string() })),
    }),
    { path: '/issueLinkType' },
  );

  return result.issueLinkTypes.map((type) => ({
    label: `${type.name} (${type.outward})`,
    value: type.id,
  }));
}

export async function commentOptions({ client, input }: Args) {
  const key = text(input.issueKey);

  if (!key) return [];

  const result = await client.request(
    z.object({
      comments: z.array(z.object({ id: z.string(), renderedBody: z.string().optional() })),
    }),
    {
      path: issuePath(key, '/comment'),
      query: { orderBy: '-created', maxResults: 100, expand: 'renderedBody' },
    },
  );

  return result.comments.map((comment) => ({
    label: plain(comment.renderedBody) || comment.id,
    value: comment.id,
  }));
}

function plain(html: string | undefined) {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

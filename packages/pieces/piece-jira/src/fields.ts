import { z } from 'zod';

import { richText, toAdf } from './adf.js';

/** The issue fields create and update both take. Jira field ids in `fields` override them. */
export const issueFieldsInput = {
  summary: z.string().trim().min(1).optional(),
  description: richText.optional(),
  assignee: z.string().optional().meta({ description: 'The assignee accountId.' }),
  priority: z.string().optional().meta({ description: 'The priority id.' }),
  parentKey: z.string().optional().meta({ description: 'The parent issue key, such as an epic.' }),
  labels: z.array(z.string()).optional(),
  fields: z.record(z.string(), z.unknown()).optional().meta({
    description:
      'Other fields by Jira field id, as Jira takes them, such as { "customfield_10016": 3 }.',
  }),
};

type IssueFieldsInput = {
  summary?: string;
  description?: z.output<typeof richText>;
  assignee?: string;
  priority?: string;
  parentKey?: string;
  labels?: string[];
  fields?: Record<string, unknown>;
};

export function issueFields(input: IssueFieldsInput) {
  return {
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.description === undefined ? {} : { description: toAdf(input.description) }),
    ...(input.assignee === undefined ? {} : { assignee: { accountId: input.assignee } }),
    ...(input.priority === undefined ? {} : { priority: { id: input.priority } }),
    ...(input.parentKey === undefined ? {} : { parent: { key: input.parentKey } }),
    ...(input.labels === undefined ? {} : { labels: input.labels }),
    ...input.fields,
  };
}

/** Renames field ids to their names, as upstream's `mapNames` does. */
export function mapFieldNames(fields: Record<string, unknown>, names: Record<string, string>) {
  return Object.fromEntries(Object.entries(fields).map(([id, value]) => [names[id] ?? id, value]));
}

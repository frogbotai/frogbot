import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { mapFieldNames } from '../fields.js';
import { listOutput, listPage, pageInput } from '../pagination.js';
import { issue } from '../records.js';

const searchPage = z.object({
  issues: z.array(issue),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
  names: z.record(z.string(), z.string()).optional(),
});

export const searchIssues = defineAction({
  slug: 'searchIssues',
  description:
    'Search Jira issues with JQL, one page at a time. Choose fields to keep pages small, and expand changelog or renderedFields when needed.',
  input: z.object({
    jql: z
      .string()
      .trim()
      .min(1)
      .meta({ description: "A JQL query, such as project = OPS AND status = 'In Progress'." }),
    fields: z.array(z.string()).optional().meta({
      description:
        'Field ids to return, such as summary or customfield_10016. *all returns every field, *navigable (the default) the standard ones, and -description leaves one out.',
    }),
    expand: z
      .array(z.enum(['renderedFields', 'names', 'schema', 'transitions', 'changelog']))
      .optional(),
    mapNames: z.boolean().default(false).meta({ description: 'Key fields by their names.' }),
    sanitizeJql: z
      .boolean()
      .default(false)
      .meta({ description: "Run the query through Jira's JQL sanitizer first, on every page." }),
    ...pageInput,
  }),
  output: listOutput(issue),
  idempotent: true,
  async run({ client, input, req }) {
    const jql = input.sanitizeJql
      ? ((
          await client.request(
            z.object({ queries: z.array(z.object({ sanitizedQuery: z.string() })) }),
            {
              method: 'POST',
              path: '/jql/sanitize',
              body: { queries: [{ query: input.jql }] },
              signal: signal(req),
            },
          )
        ).queries[0]?.sanitizedQuery ?? input.jql)
      : input.jql;

    const fields = input.fields?.filter((field) => field.trim()) ?? [];
    const expand = new Set(input.expand);

    if (input.mapNames) expand.add('names');

    const page = await client.request(searchPage, {
      method: 'POST',
      path: '/search/jql',
      body: {
        jql,
        maxResults: input.limit,
        fields: fields.length ? fields : ['*navigable'],
        ...(expand.size ? { expand: [...expand].join(',') } : {}),
        ...(input.cursor ? { nextPageToken: input.cursor } : {}),
      },
      signal: signal(req),
    });

    const issues = input.mapNames
      ? page.issues.map((item) =>
          item.fields ? { ...item, fields: mapFieldNames(item.fields, page.names ?? {}) } : item,
        )
      : page.issues;

    return listPage(issues, input.limit, page.isLast ? null : (page.nextPageToken ?? null));
  },
});

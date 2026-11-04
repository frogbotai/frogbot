import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { mapFieldNames } from '../fields.js';
import { issue } from '../records.js';

const searchPage = z.object({
  issues: z.array(issue),
  nextPageToken: z.string().optional(),
  names: z.record(z.string(), z.string()).optional(),
});

export const searchIssues = defineAction({
  slug: 'searchIssues',
  description:
    'Search Jira issues with JQL, following pages up to maxResults. Choose fields to keep large results small.',
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
    mapNames: z.boolean().default(false).meta({ description: 'Key fields by their names.' }),
    maxResults: z.number().int().min(1).max(5000).default(50),
    sanitizeJql: z
      .boolean()
      .default(true)
      .meta({ description: "Run the query through Jira's JQL sanitizer first." }),
  }),
  output: z.array(issue),
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
    const issues: z.output<typeof issue>[] = [];
    let nextPageToken: string | undefined;

    while (issues.length < input.maxResults) {
      const page = await client.request(searchPage, {
        method: 'POST',
        path: '/search/jql',
        body: {
          jql,
          maxResults: Math.min(100, input.maxResults - issues.length),
          fields: fields.length ? fields : ['*navigable'],
          ...(input.mapNames ? { expand: 'names' } : {}),
          ...(nextPageToken ? { nextPageToken } : {}),
        },
        signal: signal(req),
      });

      for (const item of page.issues) {
        issues.push(
          input.mapNames && item.fields
            ? { ...item, fields: mapFieldNames(item.fields, page.names ?? {}) }
            : item,
        );
      }

      nextPageToken = page.nextPageToken;
      if (!nextPageToken || page.issues.length === 0) break;
    }

    return issues;
  },
});

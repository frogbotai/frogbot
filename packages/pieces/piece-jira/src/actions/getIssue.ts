import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { mapFieldNames } from '../fields.js';
import { issue, issuePath } from '../records.js';
import { issueOptions } from './options.js';

const expand = z.enum([
  'renderedFields',
  'names',
  'schema',
  'transitions',
  'editmeta',
  'changelog',
]);

const record = z.record(z.string(), z.unknown());

export const getIssue = defineAction({
  slug: 'getIssue',
  description:
    'Get one Jira issue by key or id, optionally with rendered fields, transitions, edit metadata or changelog. Rich text comes back as ADF.',
  input: z.object({
    issueKey,
    expand: z.array(expand).optional(),
    mapNames: z
      .boolean()
      .default(false)
      .meta({ description: 'Key fields by their names instead of their ids.' }),
    mapTransitions: z
      .boolean()
      .default(false)
      .meta({ description: 'Return transitions as an object keyed by name.' }),
  }),
  output: issue,
  idempotent: true,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    const expanded = new Set(input.expand);

    if (input.mapNames) expanded.add('names');

    const data = await client.request(
      issue.extend({
        names: z.record(z.string(), z.string()).optional(),
        renderedFields: record.optional(),
        schema: record.optional(),
        editmeta: z.object({ fields: record }).passthrough().optional(),
        transitions: z.array(z.object({ name: z.string() }).passthrough()).optional(),
      }),
      {
        path: issuePath(input.issueKey),
        query: { expand: expanded.size ? [...expanded] : undefined },
        signal: signal(req),
      },
    );

    const names = data.names ?? {};
    const rename = (value: Record<string, unknown> | undefined) =>
      value && input.mapNames ? mapFieldNames(value, names) : value;

    return {
      ...data,
      fields: rename(data.fields),
      ...(data.renderedFields ? { renderedFields: rename(data.renderedFields) } : {}),
      ...(data.schema ? { schema: rename(data.schema) } : {}),
      ...(data.editmeta
        ? { editmeta: { ...data.editmeta, fields: rename(data.editmeta.fields) } }
        : {}),
      ...(data.transitions
        ? {
            transitions: input.mapTransitions
              ? Object.fromEntries(data.transitions.map((entry) => [entry.name, entry]))
              : data.transitions,
          }
        : {}),
    };
  },
});

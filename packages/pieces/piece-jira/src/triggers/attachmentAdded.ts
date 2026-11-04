import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { attachment } from '../records.js';
import { jqlInput, pollIssues } from './poll.js';

export const attachmentAdded = definePollingTrigger({
  slug: 'attachmentAdded',
  description:
    'Emit each file attached to a Jira issue, with its metadata and the issue. downloadAttachment saves the file.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object(jqlInput),
  output: z.object({
    issue: z.object({ id: z.string(), key: z.string(), summary: z.string().optional() }),
    attachment: attachment.partial({ filename: true }),
    addedBy: z.unknown(),
    addedAt: z.string(),
  }),
  async run({ client, input, cursor, req }) {
    return pollIssues(client, {
      cursor,
      input,
      timeField: 'updated',
      fields: ['summary', 'attachment'],
      expand: ['changelog'],
      items: ({ changelog, ...item }) => {
        const parent = {
          id: item.id,
          key: item.key,
          ...(typeof item.fields?.summary === 'string' ? { summary: item.fields.summary } : {}),
        };

        const files = new Map(
          (z.array(attachment).safeParse(item.fields?.attachment).data ?? []).map((file) => [
            file.id,
            file,
          ]),
        );

        return (changelog?.histories ?? []).flatMap((history) =>
          history.items
            .filter(
              (change) =>
                (change.fieldId === 'attachment' || change.field === 'Attachment') && change.to,
            )
            .map((change) => ({
              id: change.to!,
              epoch: Date.parse(history.created),
              event: {
                issue: parent,
                attachment: files.get(change.to!) ?? {
                  id: change.to!,
                  ...(change.toString ? { filename: change.toString } : {}),
                },
                addedBy: history.author,
                addedAt: history.created,
              },
            })),
        );
      },
      signal: signal(req),
    });
  },
});

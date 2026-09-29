import { z } from 'zod';

import { notionId } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { notionComment, notionPage } from '../schemas.js';

function databaseTrigger<const TSlug extends string>(
  slug: TSlug,
  timestamp: 'created_time' | 'last_edited_time',
) {
  return definePollingTrigger({
    slug,
    description: `Emit ${timestamp === 'created_time' ? 'new' : 'updated'} database items.`,
    type: 'polling',
    schedule: '*/5 * * * *',
    input: z.object({ databaseId: notionId }),
    output: notionPage,
    sample: { object: 'page', id: 'example' },
    async run({ client, input, cursor, req }) {
      const since = typeof cursor === 'number' ? cursor : undefined;
      const now = Date.now();
      const filter = since
        ? { timestamp, [timestamp]: { on_or_after: new Date(since).toISOString() } }
        : undefined;
      const pages = z.array(notionPage).parse(
        await client.listAll({
          path: `/databases/${input.databaseId}/query`,
          body: { filter, sorts: [{ timestamp, direction: 'descending' }] },
          signal: req.signal ?? undefined,
        }),
      );
      const seen = new Set<string>();
      const events = pages.filter((page) => {
        const time = page[timestamp];

        if (seen.has(page.id) || (since && (time === undefined || Date.parse(time) <= since))) {
          return false;
        }

        seen.add(page.id);

        return true;
      });

      return { events, cursor: now };
    },
  });
}

export const newDatabaseItem = databaseTrigger('newDatabaseItem', 'created_time');
export const updatedDatabaseItem = databaseTrigger('updatedDatabaseItem', 'last_edited_time');

export const newComment = definePollingTrigger({
  slug: 'newComment',
  description: 'Emit comments added to a page.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({ pageId: notionId }),
  output: notionComment,
  sample: { object: 'comment', id: 'example', created_time: '2026-01-01T00:00:00.000Z' },
  async run({ client, input, cursor, req }) {
    const since = typeof cursor === 'number' ? cursor : undefined;
    const now = Date.now();
    const comments = z.array(notionComment).parse(
      await client.listAll({
        path: '/comments',
        query: { block_id: input.pageId },
        signal: req.signal ?? undefined,
      }),
    );

    const seen = new Set<string>();
    const events = comments.filter((comment) => {
      if (seen.has(comment.id) || (since && Date.parse(comment.created_time) <= since)) {
        return false;
      }

      seen.add(comment.id);

      return true;
    });

    return { events, cursor: now };
  },
});

export const updatedPage = definePollingTrigger({
  slug: 'updatedPage',
  description: 'Emit updated workspace pages.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({}),
  output: notionPage,
  sample: { object: 'page', id: 'example' },
  async run({ client, cursor, req }) {
    const since = typeof cursor === 'number' ? cursor : undefined;
    const now = Date.now();
    const pages = z.array(notionPage).parse(
      await client.listAll({
        path: '/search',
        body: {
          filter: { property: 'object', value: 'page' },
          sort: { timestamp: 'last_edited_time', direction: 'descending' },
        },
        signal: req.signal ?? undefined,
      }),
    );
    const seen = new Set<string>();
    const events = pages.filter((page) => {
      if (
        seen.has(page.id) ||
        (since &&
          (page.last_edited_time === undefined || Date.parse(page.last_edited_time) <= since))
      ) {
        return false;
      }

      seen.add(page.id);

      return true;
    });

    return { events, cursor: now };
  },
});

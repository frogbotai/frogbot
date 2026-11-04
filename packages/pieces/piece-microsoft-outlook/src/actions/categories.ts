import { z } from 'zod';

import { type MicrosoftOutlookClient, signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { messagePath } from '../mail.js';

const input = z.object({
  messageId: identifier,
  categories: z.array(z.string().trim().min(1)).min(1),
});

const output = z.object({ id: z.string(), categories: z.array(z.string()) });

async function updateCategories(
  client: MicrosoftOutlookClient,
  messageId: string,
  abortSignal: AbortSignal | undefined,
  update: (current: string[]) => string[],
) {
  const path = messagePath(client.mailbox, messageId);
  const current = await client.request(
    path,
    z.object({ categories: z.array(z.string()).nullish() }),
    { query: { $select: 'categories' }, signal: abortSignal },
  );

  return client.request(path, output, {
    method: 'PATCH',
    body: { categories: update(current.categories ?? []) },
    signal: abortSignal,
  });
}

export const addCategory = defineAction({
  slug: 'addCategory',
  description: 'Add Outlook categories (labels) to an email, keeping its existing ones.',
  input,
  output,
  idempotent: true,
  run: ({ client, input, req }) =>
    updateCategories(client, input.messageId, signal(req), (current) => [
      ...new Set([...current, ...input.categories]),
    ]),
});

export const removeCategory = defineAction({
  slug: 'removeCategory',
  description: 'Remove Outlook categories (labels) from an email.',
  input,
  output,
  idempotent: true,
  run: ({ client, input, req }) =>
    updateCategories(client, input.messageId, signal(req), (current) =>
      current.filter((category) => !input.categories.includes(category)),
    ),
});

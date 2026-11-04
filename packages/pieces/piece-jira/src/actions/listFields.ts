import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';

const item = z
  .object({
    id: z.string(),
    key: z.string().optional(),
    name: z.string(),
    schema: z
      .object({ type: z.string(), items: z.string().optional(), custom: z.string().optional() })
      .passthrough()
      .optional(),
    custom: z.boolean().optional(),
  })
  .passthrough();

export const listFields = defineAction({
  slug: 'listFields',
  description:
    'List one page of issue fields, system and custom, with each schema to spot sprint and rich-text fields.',
  input: z.object({ ...pageInput }),
  output: listOutput(item),
  idempotent: true,

  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: '/field/search',
      key: 'values',
      query: { expand: 'key' },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});

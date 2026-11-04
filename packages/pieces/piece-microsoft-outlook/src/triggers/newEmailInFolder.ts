import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { message } from '../mail.js';
import { pollFolder } from './poll.js';

export const newEmailInFolder = definePollingTrigger({
  slug: 'newEmailInFolder',
  description: 'Emit each new email in one mail folder.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({
    folderId: identifier.meta({
      description: 'A folder id, or a well-known name such as inbox or sentitems.',
    }),
  }),
  output: message,
  async run({ client, input, cursor, req }) {
    const result = await pollFolder(client, {
      folderId: input.folderId,
      cursor,
      signal: signal(req),
    });

    return { events: result.messages, cursor: result.cursor };
  },
});

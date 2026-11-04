import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { message } from '../mail.js';
import { fromSender, pollFolder, toRecipient } from './poll.js';

export const newEmail = definePollingTrigger({
  slug: 'newEmail',
  description: 'Emit each new email in the inbox, optionally only from a sender or to a recipient.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({
    from: z.email().optional().meta({ description: 'Only emails from this address.' }),
    to: z.email().optional().meta({ description: 'Only emails to or copied to this address.' }),
  }),
  output: message,
  async run({ client, input, cursor, req }) {
    const result = await pollFolder(client, { folderId: 'inbox', cursor, signal: signal(req) });

    return {
      events: result.messages.filter(
        (item) => fromSender(item, input.from) && toRecipient(item, input.to),
      ),
      cursor: result.cursor,
    };
  },
});

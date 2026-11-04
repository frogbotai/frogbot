import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { content, message, newMessage, recipients } from '../mail.js';

export const createDraftEmail = defineAction({
  slug: 'createDraftEmail',
  description: 'Save a new email as a draft.',
  input: z.object({ ...recipients, subject: z.string(), ...content }),
  output: message,
  idempotent: false,
  async run({ client, input, req, overrideAccess }) {
    return client.request(`${client.mailbox}/messages`, message, {
      method: 'POST',
      body: await newMessage(req, input, overrideAccess),
      signal: signal(req),
    });
  },
});

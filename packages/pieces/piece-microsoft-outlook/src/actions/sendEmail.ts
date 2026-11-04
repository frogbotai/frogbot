import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { content, newMessage, recipients } from '../mail.js';

export const sendEmail = defineAction({
  slug: 'sendEmail',
  description: 'Send an email and save it to Sent Items.',
  input: z.object({ ...recipients, subject: z.string(), ...content }),
  output: z.object({ sent: z.literal(true) }),
  idempotent: false,
  async run({ client, input, req, overrideAccess }) {
    await client.request(`${client.mailbox}/sendMail`, z.unknown(), {
      method: 'POST',
      body: { message: await newMessage(req, input, overrideAccess), saveToSentItems: true },
      signal: signal(req),
    });

    return { sent: true as const };
  },
});

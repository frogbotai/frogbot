import type { PieceDefinition } from 'frogbot/pieces';

import type { ResendClient } from './client.js';
import { address, addresses, compact, send } from './format.js';
import type { ResendTypes } from './piece-types.js';

export const resendEmail = {
  async send({ message, client, options }) {
    const from = address(message.from ?? options.from);
    if (!from) throw new Error('[frogbot] Resend email requires a from address.');
    return send(
      client,
      compact({
        from,
        to: addresses(message.to),
        cc: addresses(message.cc),
        bcc: addresses(message.bcc),
        reply_to: addresses(message.replyTo),
        subject: message.subject,
        html: typeof message.html === 'string' ? message.html : undefined,
        text: typeof message.text === 'string' ? message.text : undefined,
      }),
    );
  },
} satisfies NonNullable<PieceDefinition<ResendTypes, ResendClient>['email']>;

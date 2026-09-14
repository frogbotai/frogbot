import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PieceWebhook } from 'frogbot/pieces';

import type { XeroOptions } from './config.js';

export const xeroWebhook: PieceWebhook<XeroOptions> = {
  async verify({ req, options }) {
    const signature = req.headers.get('x-xero-signature');

    if (!options.webhookKey || !signature || !req.arrayBuffer) return false;

    try {
      const expected = createHmac('sha256', options.webhookKey)
        .update(Buffer.from(await req.arrayBuffer()))
        .digest();
      const actual = Buffer.from(signature, 'base64');

      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  },
  parse() {
    return { event: 'xero.events' };
  },
};

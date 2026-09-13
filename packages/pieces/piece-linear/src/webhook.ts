import { LinearWebhookClient } from '@linear/sdk/webhooks';
import type { PieceWebhook } from 'frogbot/pieces';

import type { LinearOptions } from './config.js';

export const linearWebhook: PieceWebhook<LinearOptions> = {
  async verify({ req, options }) {
    const signature = req.headers.get('linear-signature');
    if (!options.webhookSecret || !signature || !req.arrayBuffer) return false;

    try {
      const body = Buffer.from(await req.arrayBuffer());
      const delivery: unknown = JSON.parse(body.toString('utf8'));
      const timestamp =
        typeof delivery === 'object' && delivery !== null && 'webhookTimestamp' in delivery
          ? delivery.webhookTimestamp
          : undefined;
      if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
        return false;
      }
      return new LinearWebhookClient(options.webhookSecret).verify(body, signature, timestamp);
    } catch {
      return false;
    }
  },
};

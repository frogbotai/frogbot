import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PieceWebhook } from 'frogbot/pieces';

import type { PagerdutyOptions } from './config.js';

export const pagerdutyWebhook: PieceWebhook<PagerdutyOptions> = {
  async verify({ req, options }) {
    const header = req.headers.get('x-pagerduty-signature');

    if (!options.signingSecret || !header || !req.arrayBuffer) return false;

    try {
      const body = Buffer.from(await req.arrayBuffer());

      if (body.length === 0) return false;

      const expected = createHmac('sha256', options.signingSecret).update(body).digest();

      return header.split(',').some((value) => {
        const signature = value.trim();

        if (!signature.startsWith('v1=')) return false;

        const actual = Buffer.from(signature.slice(3), 'hex');

        return actual.length === expected.length && timingSafeEqual(actual, expected);
      });
    } catch {
      return false;
    }
  },
};

import { timingSafeEqual } from 'node:crypto';

import type { Endpoint } from '../endpoints/types.js';
import { getChannelHost } from './host.js';

const DEFAULT_DURATION = 8 * 60_000;
const MAX_DURATION = 10 * 60_000;

function authorized(value: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(value ?? '');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function buildChannelGatewayEndpoints(): Endpoint[] {
  return [
    {
      path: '/channels/gateway',
      method: 'post',
      async handler(req) {
        const secret = process.env.FROGBOT_CHANNELS_CRON_SECRET;

        if (!secret) return new Response(null, { status: 404 });
        if (!authorized(req.headers.get('authorization'), secret)) {
          return new Response(null, { status: 401 });
        }

        const configured = Number(process.env.FROGBOT_CHANNELS_CRON_DURATION_MS);
        const durationMs =
          Number.isSafeInteger(configured) && configured > 0
            ? Math.min(configured, MAX_DURATION)
            : DEFAULT_DURATION;
        const host = getChannelHost(req.frogbot);

        if (!host?.hasGatewayAdapters()) return Response.json({ ran: false });

        const ran = await host.runGatewayListener({ durationMs, signal: req.signal });

        return Response.json({ ran }, { status: ran ? 200 : 409 });
      },
    },
  ];
}

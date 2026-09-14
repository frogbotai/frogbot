import { createHmac } from 'node:crypto';

import { z } from 'zod';

import { definePiece } from '../../../../../packages/frogbot/src/pieces/definePiece.js';

export const echoSecret = 'echo-secret';
export const echoCalls: Array<Record<string, unknown>> = [];

export function resetEchoCalls(): void {
  echoCalls.length = 0;
}

export function defineEchoPiece(define: typeof definePiece) {
  return define({
    slug: 'echo',
    label: 'Echo',
    actions: [],
    options: z.object({ prefix: z.string() }),
    client: ({ options }) => options,
    webhook: {
      async verify({ req }) {
        const body = await req.text!();
        return (
          req.headers.get('x-echo-signature') ===
          createHmac('sha256', echoSecret).update(body).digest('hex')
        );
      },
      async handshake({ req }) {
        const data = req.data as { challenge?: string } | undefined;
        return data?.challenge ? Response.json({ challenge: data.challenge }) : null;
      },
      parse({ req }) {
        return { event: (req.data as { event: string }).event };
      },
    },
    triggers: [
      {
        slug: 'received',
        type: 'app',
        event: 'received',
        description: 'Receive an echo event.',
        input: z.object({}),
        output: z.object({ message: z.string() }),
        async run({ req, options, client }) {
          const data = req.data as { id: string; message: string };
          echoCalls.push({ type: 'app', data, options, client });
          return [{ dedupeKey: data.id, data: { message: `${options.prefix}${data.message}` } }];
        },
      },
      {
        slug: 'subscribed',
        type: 'webhook',
        description: 'Receive a subscribed echo event.',
        input: z.object({ channel: z.string() }),
        output: z.object({ message: z.string() }),
        async onEnable({ input, webhookUrl, options, client }) {
          echoCalls.push({ type: 'enable', input, webhookUrl, options, client });
          return { enabled: input.channel };
        },
        async onDisable({ input, state, options, client }) {
          echoCalls.push({ type: 'disable', input, state, options, client });
        },
        async run({ req, input, options, client, state }) {
          const data = req.data as { id: string; message: string };
          echoCalls.push({ type: 'webhook', input, data, options, client, state });
          return [{ dedupeKey: data.id, data: { message: `${options.prefix}${data.message}` } }];
        },
      },
      {
        slug: 'other',
        type: 'webhook',
        description: 'Receive another subscribed echo event.',
        input: z.object({ channel: z.string() }),
        output: z.object({ message: z.string() }),
        async onEnable() {
          return {};
        },
        async onDisable() {},
        async run({ req, input, options, client }) {
          const data = req.data as { id: string; message: string };
          echoCalls.push({ type: 'other', input, data, options, client });
          return [{ dedupeKey: data.id, data: { message: `${options.prefix}${data.message}` } }];
        },
      },
    ],
  });
}

export const createEchoPiece = defineEchoPiece(definePiece);

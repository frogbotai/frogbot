import { createHmac } from 'node:crypto';

import { createPieceHelpers, type definePiece } from 'frogbot/pieces';
import { z } from 'zod';

export const echoSecret = 'echo-secret';
export const echoCalls: Array<Record<string, unknown>> = [];

export function resetEchoCalls(): void {
  echoCalls.length = 0;
}

type EchoOptions = { prefix: string };

const { defineAppTrigger, defineWebhookTrigger } = createPieceHelpers<EchoOptions, EchoOptions>();

export function defineEchoPiece(define: typeof definePiece) {
  const receivedTrigger = defineAppTrigger({
    slug: 'received',
    type: 'app',
    event: 'received',
    description: 'Receive an echo event.',
    input: z.object({}),
    output: z.object({ message: z.string() }),
    run({ req, options, client }) {
      const data = req.data as { id: string; message: string };
      echoCalls.push({ type: 'app', data, options, client });
      return Promise.resolve([
        { dedupeKey: data.id, data: { message: `${options.prefix}${data.message}` } },
      ]);
    },
  });

  const subscribedTrigger = defineWebhookTrigger({
    slug: 'subscribed',
    type: 'webhook',
    description: 'Receive a subscribed echo event.',
    input: z.object({ channel: z.string() }),
    output: z.object({ message: z.string() }),
    onEnable({ input, webhookUrl, options, client }) {
      echoCalls.push({ type: 'enable', input, webhookUrl, options, client });
      return Promise.resolve({ enabled: input.channel });
    },
    onDisable({ input, state, options, client }) {
      echoCalls.push({ type: 'disable', input, state, options, client });
      return Promise.resolve();
    },
    run({ req, input, options, client, state }) {
      const data = req.data as { id: string; message: string };
      echoCalls.push({ type: 'webhook', input, data, options, client, state });
      return Promise.resolve([
        { dedupeKey: data.id, data: { message: `${options.prefix}${data.message}` } },
      ]);
    },
  });

  const otherTrigger = defineWebhookTrigger({
    slug: 'other',
    type: 'webhook',
    description: 'Receive another subscribed echo event.',
    input: z.object({ channel: z.string() }),
    output: z.object({ message: z.string() }),
    onEnable() {
      return Promise.resolve({});
    },
    async onDisable() {},
    run({ req, input, options, client }) {
      const data = req.data as { id: string; message: string };
      echoCalls.push({ type: 'other', input, data, options, client });
      return Promise.resolve([
        { dedupeKey: data.id, data: { message: `${options.prefix}${data.message}` } },
      ]);
    },
  });

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
      handshake({ req }) {
        const data = req.data as { challenge?: string } | undefined;
        return Promise.resolve(
          data?.challenge ? Response.json({ challenge: data.challenge }) : null,
        );
      },
      parse({ req }) {
        return { event: (req.data as { event: string }).event };
      },
    },
    triggers: [receivedTrigger, subscribedTrigger, otherTrigger],
  });
}

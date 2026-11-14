// src/jobs/sendWebhook.ts
import { createHmac } from 'node:crypto';

import type { TaskConfig } from 'frogbot/jobs';

type Delivery = {
  input: { deliveryId: string; url: string; event: string; data: Record<string, unknown> };
  output: { status: number };
};

export const sendWebhook: TaskConfig<Delivery> = {
  slug: 'send-webhook',
  retries: { attempts: 6, backoff: { type: 'exponential', delay: 30_000 } },
  inputSchema: [
    { name: 'deliveryId', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
    { name: 'event', type: 'text', required: true },
    { name: 'data', type: 'json', required: true },
  ],
  outputSchema: [{ name: 'status', type: 'number', required: true }],
  async handler({ input }) {
    const body = JSON.stringify({ id: input.deliveryId, event: input.event, data: input.data });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(`${input.deliveryId}.${timestamp}.${body}`)
      .digest('base64');

    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': input.deliveryId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`${input.url} answered ${response.status}`);

    return { output: { status: response.status } };
  },
};

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { StripeClient, StripeResponse } from './client.js';

const optionalId = z.string().min(1).optional();
const noFilters = z.object({});
const customerFilter = z.object({ customerId: optionalId });
const chargeFilter = z.object({ chargeId: optionalId, paymentIntentId: optionalId });
const invoiceFilter = z.object({
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional(),
  customerId: optionalId,
  subscriptionId: optionalId,
});
const subscriptionFilter = z.object({
  status: z
    .enum([
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
    ])
    .optional(),
  customerId: optionalId,
});

type StripeWebhookState = { webhookId: string; endpointSecret: string };
const stripeEvent = z.object({
  id: z.string().min(1),
  type: z.string(),
  data: z.object({ object: z.record(z.string(), z.json()) }),
});

function signatureValues(header: string): { timestamp: string; signatures: string[] } {
  const values = header.split(',').map((part) => part.split('=', 2));
  const timestamp = values.find(([key]) => key === 't')?.[1];

  return {
    timestamp: timestamp ?? '',
    signatures: values.filter(([key]) => key === 'v1').map(([, value]) => value ?? ''),
  };
}

function verifySignature(body: string, header: string | null, secret: string): void {
  if (!header) throw new Error('Stripe webhook is missing the Stripe-Signature header.');

  const { timestamp, signatures } = signatureValues(header);
  const timestampNumber = Number(timestamp);

  if (
    !timestamp ||
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) {
    throw new Error('Stripe webhook signature timestamp is invalid or expired.');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  const valid = signatures.some((signature) => {
    if (!/^[\da-f]{64}$/i.test(signature)) return false;

    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  });

  if (!valid) throw new Error('Stripe webhook signature is invalid.');
}

function webhookTrigger<TInput extends z.ZodType>({
  slug,
  event,
  description,
  input,
  matches,
}: {
  slug: string;
  event: string;
  description: string;
  input: TInput;
  matches?: (object: StripeResponse, input: z.output<TInput>) => boolean;
}): PieceWebhookTrigger<
  TInput,
  undefined,
  Record<string, never>,
  StripeClient,
  StripeWebhookState
> {
  return {
    slug,
    description,
    type: 'webhook',
    input,
    async onEnable({ client, webhookUrl }) {
      const endpoint = await client.subscribe(event, webhookUrl);

      if (typeof endpoint.id !== 'string' || typeof endpoint.secret !== 'string') {
        throw new Error(`Stripe failed to create the ${slug} webhook endpoint.`);
      }

      return { webhookId: endpoint.id, endpointSecret: endpoint.secret };
    },
    async onDisable({ client, state }) {
      await client.unsubscribe(state.webhookId);
    },
    async run({ input, req, state }) {
      if (!req.text) throw new Error('Stripe webhook raw body is unavailable.');

      const body = await req.text();

      verifySignature(body, req.headers.get('stripe-signature'), state.endpointSecret);

      const delivery = stripeEvent.parse(JSON.parse(body));
      const object = delivery.data.object;

      if (delivery.type !== event) return [];
      if (matches && !matches(object, input)) return [];

      return [
        {
          dedupeKey: delivery.id,
          data: object,
        },
      ];
    },
  };
}

export const stripeTriggerDefinitions = [
  webhookTrigger({
    slug: 'paymentSucceeded',
    event: 'payment_intent.succeeded',
    description: 'Trigger when a payment succeeds.',
    input: noFilters,
  }),
  webhookTrigger({
    slug: 'customerCreated',
    event: 'customer.created',
    description: 'Trigger when a customer is created.',
    input: noFilters,
  }),
  webhookTrigger({
    slug: 'paymentFailed',
    event: 'charge.failed',
    description: 'Trigger when a payment fails.',
    input: noFilters,
  }),
  webhookTrigger({
    slug: 'subscriptionCreated',
    event: 'customer.subscription.created',
    description: 'Trigger when a subscription is created.',
    input: noFilters,
  }),
  webhookTrigger({
    slug: 'chargeSucceeded',
    event: 'charge.succeeded',
    description: 'Trigger when a charge succeeds.',
    input: noFilters,
  }),
  webhookTrigger({
    slug: 'invoiceCreated',
    event: 'invoice.created',
    description: 'Trigger when an invoice is created.',
    input: invoiceFilter,
    matches: (object, input) =>
      (!input.status || object.status === input.status) &&
      (!input.customerId || object.customer === input.customerId) &&
      (!input.subscriptionId || object.subscription === input.subscriptionId),
  }),
  webhookTrigger({
    slug: 'invoicePaymentFailed',
    event: 'invoice.payment_failed',
    description: 'Trigger when an invoice payment fails.',
    input: customerFilter,
    matches: (object, input) => !input.customerId || object.customer === input.customerId,
  }),
  webhookTrigger({
    slug: 'subscriptionCanceled',
    event: 'customer.subscription.deleted',
    description: 'Trigger when a subscription is canceled.',
    input: customerFilter,
    matches: (object, input) => !input.customerId || object.customer === input.customerId,
  }),
  webhookTrigger({
    slug: 'refundCreated',
    event: 'refund.created',
    description: 'Trigger when a refund is created.',
    input: chargeFilter,
    matches: (object, input) =>
      (!input.chargeId || object.charge === input.chargeId) &&
      (!input.paymentIntentId || object.payment_intent === input.paymentIntentId),
  }),
  webhookTrigger({
    slug: 'disputeCreated',
    event: 'charge.dispute.created',
    description: 'Trigger when a dispute is created.',
    input: chargeFilter,
    matches: (object, input) =>
      (!input.chargeId || object.charge === input.chargeId) &&
      (!input.paymentIntentId || object.payment_intent === input.paymentIntentId),
  }),
  webhookTrigger({
    slug: 'paymentLinkCreated',
    event: 'payment_link.created',
    description: 'Trigger when a payment link is created.',
    input: noFilters,
  }),
  webhookTrigger({
    slug: 'subscriptionUpdated',
    event: 'customer.subscription.updated',
    description: 'Trigger when a subscription is updated.',
    input: subscriptionFilter,
    matches: (object, input) =>
      (!input.status || object.status === input.status) &&
      (!input.customerId || object.customer === input.customerId),
  }),
  webhookTrigger({
    slug: 'checkoutCompleted',
    event: 'checkout.session.completed',
    description: 'Trigger when a checkout session completes.',
    input: customerFilter,
    matches: (object, input) => !input.customerId || object.customer === input.customerId,
  }),
] as const;

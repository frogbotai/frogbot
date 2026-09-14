import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { stripeActionDefinitions } from '../../../packages/pieces/piece-stripe/src/actions.js';
import {
  createStripe,
  stripeActions,
  stripeTriggers,
} from '../../../packages/pieces/piece-stripe/src/index.js';
import { stripeTriggerDefinitions } from '../../../packages/pieces/piece-stripe/src/triggers.js';

const auth = { apiKey: 'sk_test_frog' };
const req = () =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('stripe actions', () => {
  it('exposes all registered actions and triggers with semantic names', () => {
    const stripe = createStripe({ auth });

    expect(pieceInstanceTools(stripe)?.map(({ slug }) => slug)).toEqual(
      stripeActions.map((slug) => `stripe_${slug}`),
    );
    expect(Object.keys(stripe.triggers)).toEqual(stripeTriggers);
    expect(stripeActions).toHaveLength(19);
    expect(stripeTriggers).toHaveLength(13);
  });

  it.each([
    ['createCustomer', { email: 'frog@example.com', name: 'Frog' }, 'POST', '/v1/customers'],
    ['createInvoice', { customerId: 'cus_1' }, 'POST', '/v1/invoices'],
    ['searchCustomers', { email: 'frog@example.com' }, 'GET', '/v1/customers/search'],
    ['searchSubscriptions', {}, 'GET', '/v1/subscriptions'],
    ['getCustomer', { customerId: 'cus_1' }, 'GET', '/v1/customers/cus_1'],
    ['updateCustomer', { customerId: 'cus_1', name: 'Toad' }, 'POST', '/v1/customers/cus_1'],
    ['createPaymentIntent', { amount: 10.5, currency: 'usd' }, 'POST', '/v1/payment_intents'],
    ['createProduct', { name: 'Lilypad' }, 'POST', '/v1/products'],
    [
      'createPrice',
      { productId: 'prod_1', unitAmount: 2.5, currency: 'usd' },
      'POST',
      '/v1/prices',
    ],
    [
      'createSubscription',
      { customerId: 'cus_1', items: [{ priceId: 'price_1' }] },
      'POST',
      '/v1/subscriptions',
    ],
    ['cancelSubscription', { subscriptionId: 'sub_1' }, 'DELETE', '/v1/subscriptions/sub_1'],
    ['getInvoice', { invoiceId: 'in_1' }, 'GET', '/v1/invoices/in_1'],
    ['getPayout', { payoutId: 'po_1' }, 'GET', '/v1/payouts/po_1'],
    ['createRefund', { paymentIntentId: 'pi_1' }, 'POST', '/v1/refunds'],
    [
      'createPaymentLink',
      { lineItems: [{ priceId: 'price_1', quantity: 1 }] },
      'POST',
      '/v1/payment_links',
    ],
    ['deactivatePaymentLink', { paymentLinkId: 'plink_1' }, 'POST', '/v1/payment_links/plink_1'],
    ['getPaymentIntent', { paymentIntentId: 'pi_1' }, 'GET', '/v1/payment_intents/pi_1'],
    ['findInvoice', { invoiceId: 'in_1' }, 'GET', '/v1/invoices/in_1'],
    ['sendRequest', { method: 'GET', path: '/balance' }, 'GET', '/v1/balance'],
  ] as const)(
    'runs %s through the controlled Stripe transport',
    async (slug, input, method, path) => {
      const fetch = vi.fn().mockResolvedValue(response({ id: 'result' }));
      vi.stubGlobal('fetch', fetch);

      const stripe = createStripe({ auth });
      await stripe[slug]({ input, req: req() } as never);

      const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];

      expect(url.pathname).toBe(path);
      expect(init.method).toBe(method);
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${auth.apiKey}` });
    },
  );

  it('encodes nested Stripe form fields and decimal amounts', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: 'pi_1' }));
    vi.stubGlobal('fetch', fetch);

    await createStripe({ auth }).createPaymentLink({
      input: {
        lineItems: [{ priceId: 'price_1', quantity: 2 }],
        afterCompletion: 'redirect',
        redirectUrl: 'https://example.com/complete',
      },
      req: req(),
    });

    const body = fetch.mock.calls[0]?.[1]?.body as URLSearchParams;

    expect(body.get('line_items[0][price]')).toBe('price_1');
    expect(body.get('line_items[0][quantity]')).toBe('2');
    expect(body.get('after_completion[redirect][url]')).toBe('https://example.com/complete');
  });

  it('keeps Stripe failures useful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: { message: 'No such customer' } }, 404)),
    );

    await expect(
      createStripe({ auth }).getCustomer({ input: { customerId: 'missing' }, req: req() }),
    ).rejects.toThrow('Stripe request failed (404): No such customer');
  });

  it('returns the real status and headers from custom API calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ deleted: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json', 'x-request-id': 'request' },
        }),
      ),
    );

    const result = await createStripe({ auth }).sendRequest({
      input: { method: 'DELETE', path: '/customers/cus_1', body: { cascade: true } },
      req: req(),
    });

    expect(result).toEqual({
      status: 202,
      headers: { 'content-type': 'application/json', 'x-request-id': 'request' },
      body: { deleted: true },
    });
  });

  it('loads every dynamic resource choice through the client', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => response({ data: [{ id: 'resource', name: 'Frog' }] }));
    vi.stubGlobal('fetch', fetch);
    const stripe = createStripe({ auth });
    const client = await stripe.client({ req: req() });

    for (const [slug, field] of [
      ['createInvoice', 'customerId'],
      ['getCustomer', 'customerId'],
      ['updateCustomer', 'customerId'],
      ['createPaymentIntent', 'customerId'],
      ['createPrice', 'productId'],
      ['createSubscription', 'customerId'],
      ['cancelSubscription', 'subscriptionId'],
      ['getInvoice', 'invoiceId'],
      ['getPayout', 'payoutId'],
      ['createRefund', 'paymentIntentId'],
      ['deactivatePaymentLink', 'paymentLinkId'],
      ['getPaymentIntent', 'paymentIntentId'],
    ] as const) {
      const definition = stripeActionDefinitions.find((action) => action.slug === slug)!;
      const loadOptions = definition.options![field] as (args: {
        client: typeof client;
        input: Record<string, unknown>;
        options: Record<string, never>;
        req: ReturnType<typeof req>;
      }) => Promise<Array<{ label: string; value: string }>>;

      await expect(loadOptions({ client, input: {}, options: {}, req: req() })).resolves.toEqual([
        { label: expect.any(String), value: 'resource' },
      ]);
    }
  });
});

describe('stripe triggers', () => {
  const secret = 'whsec_frog';

  function webhookRequest(delivery: unknown, signingSecret = secret) {
    const body = JSON.stringify(delivery);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', signingSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    return new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
      body,
    });
  }

  it('creates, persists, and removes a dedicated Stripe endpoint', async () => {
    const trigger = stripeTriggerDefinitions[0];
    const subscribe = vi.fn().mockResolvedValue({ id: 'we_1', secret });
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const client = { subscribe, unsubscribe };

    const state = await trigger.onEnable({
      client,
      input: {},
      options: {},
      req: req(),
      webhookUrl: 'https://example.com/webhook',
    } as never);

    expect(subscribe).toHaveBeenCalledWith(
      'payment_intent.succeeded',
      'https://example.com/webhook',
    );
    expect(state).toEqual({ webhookId: 'we_1', endpointSecret: secret });

    await trigger.onDisable({ client, input: {}, options: {}, req: req(), state } as never);

    expect(unsubscribe).toHaveBeenCalledWith('we_1');
  });

  it('authenticates the unchanged body and rejects forged deliveries', async () => {
    const trigger = stripeTriggerDefinitions[0];
    const delivery = {
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1' } },
    };

    await expect(
      trigger.run({
        client: {},
        input: {},
        options: {},
        req: webhookRequest(delivery),
        state: { webhookId: 'we_1', endpointSecret: secret },
      } as never),
    ).resolves.toEqual([{ dedupeKey: 'evt_1', data: { id: 'pi_1' } }]);

    await expect(
      trigger.run({
        client: {},
        input: {},
        options: {},
        req: webhookRequest(delivery, 'wrong-secret'),
        state: { webhookId: 'we_1', endpointSecret: secret },
      } as never),
    ).rejects.toThrow('Stripe webhook signature is invalid.');
  });

  it('requires the raw body reader before attempting signature verification', async () => {
    const trigger = stripeTriggerDefinitions[0];

    await expect(
      trigger.run({
        client: {},
        input: {},
        options: {},
        req: { headers: new Headers() },
        state: { webhookId: 'we_1', endpointSecret: secret },
      } as never),
    ).rejects.toThrow('Stripe webhook raw body is unavailable.');
  });

  it('rejects signed deliveries without a stable event ID', async () => {
    const trigger = stripeTriggerDefinitions[0];

    await expect(
      trigger.run({
        client: {},
        input: {},
        options: {},
        req: webhookRequest({
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_1' } },
        }),
        state: { webhookId: 'we_1', endpointSecret: secret },
      } as never),
    ).rejects.toThrow();
  });

  it.each([
    [
      'invoiceCreated',
      { status: 'paid', customerId: 'cus_1', subscriptionId: 'sub_1' },
      { status: 'open', customer: 'cus_1', subscription: 'sub_1' },
    ],
    ['invoicePaymentFailed', { customerId: 'cus_1' }, { customer: 'cus_2' }],
    ['subscriptionCanceled', { customerId: 'cus_1' }, { customer: 'cus_2' }],
    [
      'refundCreated',
      { chargeId: 'ch_1', paymentIntentId: 'pi_1' },
      { charge: 'ch_2', payment_intent: 'pi_1' },
    ],
    [
      'disputeCreated',
      { chargeId: 'ch_1', paymentIntentId: 'pi_1' },
      { charge: 'ch_1', payment_intent: 'pi_2' },
    ],
    [
      'subscriptionUpdated',
      { status: 'active', customerId: 'cus_1' },
      { status: 'past_due', customer: 'cus_1' },
    ],
    ['checkoutCompleted', { customerId: 'cus_1' }, { customer: 'cus_2' }],
  ] as const)('applies every pinned filter for %s', async (slug, input, object) => {
    const trigger = stripeTriggerDefinitions.find((candidate) => candidate.slug === slug)!;
    const event = {
      invoiceCreated: 'invoice.created',
      invoicePaymentFailed: 'invoice.payment_failed',
      subscriptionCanceled: 'customer.subscription.deleted',
      refundCreated: 'refund.created',
      disputeCreated: 'charge.dispute.created',
      subscriptionUpdated: 'customer.subscription.updated',
      checkoutCompleted: 'checkout.session.completed',
    }[slug];

    await expect(
      trigger.run({
        client: {},
        input,
        options: {},
        req: webhookRequest({ id: 'evt_filter', type: event, data: { object } }),
        state: { webhookId: 'we_1', endpointSecret: secret },
      } as never),
    ).resolves.toEqual([]);
  });
});

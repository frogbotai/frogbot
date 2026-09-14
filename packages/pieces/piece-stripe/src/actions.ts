import type { PieceActionDefinition, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { StripeClient, StripeResponse } from './client.js';

const output = z.record(z.string(), z.json());
const metadata = z.record(z.string(), z.string()).optional();
const optionalAddress = {
  line1: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
};

type ActionInput = z.ZodObject<Record<string, z.ZodType>>;

function defineAction<
  const TSlug extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(
  definition: PieceActionDefinition<TInput, TOutput, object, StripeClient, z.output<TOutput>> & {
    slug: TSlug;
  },
) {
  return definition;
}

function action<const TSlug extends string, TInput extends ActionInput>({
  slug,
  description,
  input,
  path,
  method = 'POST',
  idempotent = false,
  map = (value) => value,
  options,
}: {
  slug: TSlug;
  description: string;
  input: TInput;
  path: string | ((input: z.output<TInput>) => string);
  method?: 'DELETE' | 'GET' | 'POST' | ((input: z.output<TInput>) => 'DELETE' | 'GET' | 'POST');
  idempotent?: boolean;
  map?: (input: z.output<TInput>) => Record<string, unknown>;
  options?: PieceActionDefinition<TInput, typeof output, object, StripeClient>['options'];
}) {
  return defineAction({
    slug,
    description,
    input,
    output,
    idempotent,
    options,
    async run({ client, input }: PieceRunArgs<z.output<TInput>, object, StripeClient>) {
      const requestPath = typeof path === 'function' ? path(input) : path;
      const requestMethod = typeof method === 'function' ? method(input) : method;

      return client.request(requestPath, requestMethod, map(input));
    },
  });
}

const customerOptions = async ({ client }: { client: StripeClient }) =>
  client.options('customers', (item) => String(item.name || item.email || item.id));
const productOptions = async ({ client }: { client: StripeClient }) =>
  client.options('products', (item) => String(item.name || item.id));
const subscriptionOptions = async ({ client }: { client: StripeClient }) =>
  client.options('subscriptions', (item) => String(item.id));
const invoiceOptions = async ({ client }: { client: StripeClient }) =>
  client.options('invoices', (item) => String(item.number || item.id));
const payoutOptions = async ({ client }: { client: StripeClient }) =>
  client.options('payouts', (item) => String(item.id));
const paymentIntentOptions = async ({ client }: { client: StripeClient }) =>
  client.options('payment_intents', (item) => String(item.description || item.id));
const paymentLinkOptions = async ({ client }: { client: StripeClient }) =>
  client.options('payment_links', (item) => String(item.url || item.id));

export const createCustomer = action({
  slug: 'createCustomer',
  description: 'Create a Stripe customer.',
  input: z.object({
    email: z.string().email(),
    name: z.string(),
    description: z.string().optional(),
    phone: z.string().optional(),
    ...optionalAddress,
  }),
  path: 'customers',
  map: ({ line1, postalCode, city, state, country, ...customer }) => ({
    ...customer,
    address: { line1, postal_code: postalCode, city, state, country },
  }),
});

export const createInvoice = action({
  slug: 'createInvoice',
  description: 'Create a Stripe invoice for a customer.',
  input: z.object({
    customerId: z.string(),
    description: z.string().optional(),
    daysUntilDue: z.number().int().positive().optional(),
  }),
  path: 'invoices',
  map: ({ customerId, description, daysUntilDue }) => ({
    customer: customerId,
    description,
    collection_method: daysUntilDue ? 'send_invoice' : undefined,
    days_until_due: daysUntilDue,
  }),
  options: { customerId: customerOptions },
});

export const searchCustomers = action({
  slug: 'searchCustomers',
  description: 'Search Stripe customers by email.',
  input: z.object({ email: z.string().email() }),
  path: 'customers/search',
  method: 'GET',
  idempotent: true,
  map: ({ email }) => ({ query: `email:'${email.replaceAll("'", "\\'")}'` }),
});

export const searchSubscriptions = action({
  slug: 'searchSubscriptions',
  description: 'List and filter Stripe subscriptions.',
  input: z.object({
    priceIds: z.array(z.string()).optional(),
    status: z
      .enum([
        'active',
        'past_due',
        'unpaid',
        'canceled',
        'incomplete',
        'incomplete_expired',
        'trialing',
        'paused',
      ])
      .optional(),
    customerId: z.string().optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    limit: z.number().int().min(0).default(100),
    includeCustomerDetails: z.boolean().default(false),
  }),
  path: 'subscriptions',
  method: 'GET',
  idempotent: true,
  map: ({
    priceIds,
    status,
    customerId,
    createdAfter,
    createdBefore,
    limit,
    includeCustomerDetails,
  }) => ({
    price: priceIds?.[0],
    status,
    customer: customerId,
    'created[gte]': createdAfter ? Math.floor(Date.parse(createdAfter) / 1000) : undefined,
    'created[lte]': createdBefore ? Math.floor(Date.parse(createdBefore) / 1000) : undefined,
    limit: limit === 0 ? 100 : limit,
    expand: includeCustomerDetails ? ['data.customer'] : undefined,
  }),
});
searchSubscriptions.run = async ({ client, input }) => {
  const subscriptions: StripeResponse[] = [];
  let startingAfter: string | undefined;

  do {
    const page = await client.request('subscriptions', 'GET', {
      status: input.status,
      customer: input.customerId,
      'created[gte]': input.createdAfter
        ? Math.floor(Date.parse(input.createdAfter) / 1000)
        : undefined,
      'created[lte]': input.createdBefore
        ? Math.floor(Date.parse(input.createdBefore) / 1000)
        : undefined,
      limit: 100,
      starting_after: startingAfter,
      expand: input.includeCustomerDetails ? ['data.customer'] : undefined,
    });
    const pageItems = Array.isArray(page.data) ? (page.data as StripeResponse[]) : [];

    subscriptions.push(...pageItems);
    startingAfter =
      page.has_more === true && typeof pageItems.at(-1)?.id === 'string'
        ? (pageItems.at(-1)?.id as string)
        : undefined;
  } while (startingAfter && (input.limit === 0 || subscriptions.length < input.limit));

  const filtered = input.priceIds?.length
    ? subscriptions.filter((subscription) => {
        const items = subscription.items as
          { data?: Array<{ price?: { id?: unknown } }> } | undefined;

        return (
          items?.data?.some(
            ({ price }) => typeof price?.id === 'string' && input.priceIds?.includes(price.id),
          ) ?? false
        );
      })
    : subscriptions;
  const data = input.limit === 0 ? filtered : filtered.slice(0, input.limit);

  return { data, has_more: startingAfter !== undefined };
};

export const getCustomer = action({
  slug: 'getCustomer',
  description: 'Get a Stripe customer by ID.',
  input: z.object({ customerId: z.string() }),
  path: ({ customerId }) => `customers/${encodeURIComponent(customerId)}`,
  method: 'GET',
  idempotent: true,
  options: { customerId: customerOptions },
});

export const updateCustomer = action({
  slug: 'updateCustomer',
  description: 'Update a Stripe customer.',
  input: z.object({
    customerId: z.string(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    phone: z.string().optional(),
    ...optionalAddress,
  }),
  path: ({ customerId }) => `customers/${encodeURIComponent(customerId)}`,
  map: ({ customerId: _customerId, line1, postalCode, city, state, country, ...customer }) => ({
    ...customer,
    address: { line1, postal_code: postalCode, city, state, country },
  }),
  options: { customerId: customerOptions },
});

export const createPaymentIntent = action({
  slug: 'createPaymentIntent',
  description: 'Create a Stripe payment intent.',
  input: z.object({
    amount: z.number().positive(),
    currency: z.string().length(3),
    customerId: z.string().optional(),
    paymentMethodId: z.string().optional(),
    confirm: z.boolean().default(false),
    returnUrl: z.string().url().optional(),
    description: z.string().optional(),
    receiptEmail: z.string().email().optional(),
  }),
  path: 'payment_intents',
  map: ({
    amount,
    currency,
    customerId,
    paymentMethodId,
    confirm,
    returnUrl,
    description,
    receiptEmail,
  }) => {
    if (confirm && !paymentMethodId) {
      throw new Error('Payment Method ID is required when confirming a payment.');
    }
    return {
      amount: Math.round(amount * 100),
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm,
      return_url: returnUrl,
      description,
      receipt_email: receiptEmail,
    };
  },
  options: { customerId: customerOptions },
});

export const createProduct = action({
  slug: 'createProduct',
  description: 'Create a Stripe product.',
  input: z.object({
    name: z.string(),
    description: z.string().optional(),
    active: z.boolean().optional(),
    images: z.array(z.string().url()).max(8).optional(),
    url: z.string().url().optional(),
    metadata,
  }),
  path: 'products',
});

export const createPrice = action({
  slug: 'createPrice',
  description: 'Create a one-time or recurring Stripe price.',
  input: z.object({
    productId: z.string(),
    unitAmount: z.number().positive(),
    currency: z.string().length(3),
    recurringInterval: z.enum(['one_time', 'day', 'week', 'month', 'year']).default('one_time'),
    recurringIntervalCount: z.number().int().positive().optional(),
  }),
  path: 'prices',
  map: ({ productId, unitAmount, currency, recurringInterval, recurringIntervalCount }) => ({
    product: productId,
    unit_amount: Math.round(unitAmount * 100),
    currency,
    recurring:
      recurringInterval === 'one_time'
        ? undefined
        : { interval: recurringInterval, interval_count: recurringIntervalCount },
  }),
  options: { productId: productOptions },
});

export const createSubscription = action({
  slug: 'createSubscription',
  description: 'Create a Stripe subscription.',
  input: z.object({
    customerId: z.string(),
    items: z
      .array(z.object({ priceId: z.string(), quantity: z.number().int().positive().optional() }))
      .min(1),
    collectionMethod: z.enum(['charge_automatically', 'send_invoice']).optional(),
    daysUntilDue: z.number().int().positive().optional(),
    trialPeriodDays: z.number().int().positive().optional(),
    defaultPaymentMethodId: z.string().optional(),
    metadata,
  }),
  path: 'subscriptions',
  map: ({
    customerId,
    items,
    collectionMethod,
    daysUntilDue,
    trialPeriodDays,
    defaultPaymentMethodId,
    metadata,
  }) => {
    if (daysUntilDue && collectionMethod !== 'send_invoice') {
      throw new Error('Days until due requires the send_invoice collection method.');
    }

    return {
      customer: customerId,
      items: items.map(({ priceId, quantity }) => ({ price: priceId, quantity })),
      collection_method: collectionMethod,
      days_until_due: daysUntilDue,
      trial_period_days: trialPeriodDays,
      default_payment_method: defaultPaymentMethodId,
      metadata,
    };
  },
  options: { customerId: customerOptions },
});

export const cancelSubscription = action({
  slug: 'cancelSubscription',
  description: 'Cancel a Stripe subscription now or at period end.',
  input: z.object({ subscriptionId: z.string(), cancelAtPeriodEnd: z.boolean().default(false) }),
  path: ({ subscriptionId }) => `subscriptions/${encodeURIComponent(subscriptionId)}`,
  method: ({ cancelAtPeriodEnd }) => (cancelAtPeriodEnd ? 'POST' : 'DELETE'),
  map: ({ cancelAtPeriodEnd }) => ({ cancel_at_period_end: cancelAtPeriodEnd }),
  options: { subscriptionId: subscriptionOptions },
});

const getInvoiceInput = z.object({ invoiceId: z.string() });

export const getInvoice = action({
  slug: 'getInvoice',
  description: 'Get a Stripe invoice selected from available invoices.',
  input: getInvoiceInput,
  path: ({ invoiceId }) => `invoices/${encodeURIComponent(invoiceId)}`,
  method: 'GET',
  idempotent: true,
  options: { invoiceId: invoiceOptions },
});

export const getPayout = action({
  slug: 'getPayout',
  description: 'Get a Stripe payout by ID.',
  input: z.object({ payoutId: z.string() }),
  path: ({ payoutId }) => `payouts/${encodeURIComponent(payoutId)}`,
  method: 'GET',
  idempotent: true,
  options: { payoutId: payoutOptions },
});

export const createRefund = action({
  slug: 'createRefund',
  description: 'Create a full or partial Stripe refund.',
  input: z.object({
    paymentIntentId: z.string(),
    amount: z.number().positive().optional(),
    reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
    metadata,
  }),
  path: 'refunds',
  map: ({ paymentIntentId, amount, reason, metadata }) => ({
    payment_intent: paymentIntentId,
    amount: amount === undefined ? undefined : Math.round(amount * 100),
    reason,
    metadata,
  }),
  options: { paymentIntentId: paymentIntentOptions },
});

export const createPaymentLink = action({
  slug: 'createPaymentLink',
  description: 'Create a Stripe-hosted payment link.',
  input: z.object({
    lineItems: z
      .array(z.object({ priceId: z.string(), quantity: z.number().int().positive() }))
      .min(1),
    afterCompletion: z.enum(['hosted_confirmation', 'redirect']).optional(),
    redirectUrl: z.string().url().optional(),
    allowPromotionCodes: z.boolean().optional(),
    billingAddressCollection: z.enum(['auto', 'required']).optional(),
    metadata,
  }),
  path: 'payment_links',
  map: ({
    lineItems,
    afterCompletion,
    redirectUrl,
    allowPromotionCodes,
    billingAddressCollection,
    metadata,
  }) => {
    if (afterCompletion === 'redirect' && !redirectUrl) {
      throw new Error('Redirect URL is required for redirect completion.');
    }

    return {
      line_items: lineItems.map(({ priceId, quantity }) => ({ price: priceId, quantity })),
      after_completion: afterCompletion
        ? {
            type: afterCompletion,
            redirect: afterCompletion === 'redirect' ? { url: redirectUrl } : undefined,
          }
        : undefined,
      allow_promotion_codes: allowPromotionCodes,
      billing_address_collection: billingAddressCollection,
      metadata,
    };
  },
});

export const deactivatePaymentLink = action({
  slug: 'deactivatePaymentLink',
  description: 'Deactivate a Stripe payment link.',
  input: z.object({ paymentLinkId: z.string() }),
  path: ({ paymentLinkId }) => `payment_links/${encodeURIComponent(paymentLinkId)}`,
  map: () => ({ active: false }),
  options: { paymentLinkId: paymentLinkOptions },
});

export const getPaymentIntent = action({
  slug: 'getPaymentIntent',
  description: 'Get a Stripe payment intent by ID.',
  input: z.object({ paymentIntentId: z.string() }),
  path: ({ paymentIntentId }) => `payment_intents/${encodeURIComponent(paymentIntentId)}`,
  method: 'GET',
  idempotent: true,
  options: { paymentIntentId: paymentIntentOptions },
});

export const findInvoice = action({
  slug: 'findInvoice',
  description: 'Find a Stripe invoice from an explicitly supplied ID.',
  input: getInvoiceInput,
  path: ({ invoiceId }) => `invoices/${encodeURIComponent(invoiceId)}`,
  method: 'GET',
  idempotent: true,
});

const customOutput = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.record(z.string(), z.json()),
});
const customInput = z.object({
  method: z.enum(['DELETE', 'GET', 'POST']),
  path: z.string().regex(/^\/(?!\/)/, 'Path must be relative to the Stripe API.'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const sendRequest = defineAction({
  slug: 'sendRequest',
  description: 'Send an authenticated request to the Stripe API.',
  input: customInput,
  output: customOutput,
  async run({ client, input }: PieceRunArgs<z.output<typeof customInput>, object, StripeClient>) {
    return client.requestResponse(
      input.path,
      input.method,
      input.method === 'GET' ? input.query : input.body,
    );
  },
});

export const stripeActionDefinitions = [
  createCustomer,
  createInvoice,
  searchCustomers,
  searchSubscriptions,
  getCustomer,
  updateCustomer,
  createPaymentIntent,
  createProduct,
  createPrice,
  createSubscription,
  cancelSubscription,
  getInvoice,
  getPayout,
  createRefund,
  createPaymentLink,
  deactivatePaymentLink,
  getPaymentIntent,
  findInvoice,
  sendRequest,
] as const;

export type { StripeResponse };

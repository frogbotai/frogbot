import { definePiece, type PieceDefinition } from 'frogbot/pieces';
import type { z } from 'zod';

import { stripeActionDefinitions } from './actions.js';
import { createStripeClient } from './client.js';
import { stripeAuth } from './config.js';
import { stripeTriggerDefinitions } from './triggers.js';

type StripeTypes = {
  auth: z.output<typeof stripeAuth>;
  options: Record<string, never>;
  actions: {
    [TDefinition in (typeof stripeActionDefinitions)[number] as TDefinition['slug']]: {
      input: z.output<TDefinition['input']>;
      output: Awaited<ReturnType<TDefinition['run']>>;
    };
  };
  triggers: {
    [TDefinition in (typeof stripeTriggerDefinitions)[number] as TDefinition['slug']]: {
      input: z.output<TDefinition['input']>;
      output: Awaited<ReturnType<TDefinition['run']>>[number]['data'];
      state: Awaited<ReturnType<TDefinition['onEnable']>>;
    };
  };
};

export const stripeActions = [
  'createCustomer',
  'createInvoice',
  'searchCustomers',
  'searchSubscriptions',
  'getCustomer',
  'updateCustomer',
  'createPaymentIntent',
  'createProduct',
  'createPrice',
  'createSubscription',
  'cancelSubscription',
  'getInvoice',
  'getPayout',
  'createRefund',
  'createPaymentLink',
  'deactivatePaymentLink',
  'getPaymentIntent',
  'findInvoice',
  'sendRequest',
] as const;
export const stripeTriggers = stripeTriggerDefinitions.map(({ slug }) => slug);
export const stripeScopes = [] as const;

export const createStripe = definePiece({
  slug: 'stripe',
  label: 'Stripe',
  admin: {
    description: 'Process payments and manage Stripe billing resources',
    group: 'Payments',
  },
  auth: stripeAuth,
  client: ({ auth }: { auth: unknown }) => createStripeClient({ auth: stripeAuth.parse(auth) }),
  actions: [...stripeActionDefinitions],
  triggers: [...stripeTriggerDefinitions],
} satisfies PieceDefinition<StripeTypes, ReturnType<typeof createStripeClient>>);

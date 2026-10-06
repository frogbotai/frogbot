import { createStripe } from '@frogbotai/piece-stripe';
import { expectTypeOf } from 'vitest';
import type { z } from 'zod';

type JSONValue = z.output<ReturnType<typeof z.json>>;

const stripe = createStripe({ auth: { apiKey: 'sk_test' } });

const customer = stripe.createCustomer({
  input: { email: 'customer@example.com', name: 'Customer', postalCode: '12345' },
});

expectTypeOf<Parameters<typeof stripe.createCustomer>[0]['input']>().toEqualTypeOf<{
  email: string;
  name: string;
  description?: string | undefined;
  phone?: string | undefined;
  line1?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  country?: string | undefined;
}>();
expectTypeOf(customer).toEqualTypeOf<Promise<Record<string, JSONValue>>>();

const _createCustomerRejectsGetInvoiceInput = () =>
  // @ts-expect-error createCustomer does not accept getInvoice input
  stripe.createCustomer({ input: { invoiceId: 'in_123' } });

const _response = stripe.sendRequest({ input: { method: 'GET', path: '/customers' } });

expectTypeOf<Awaited<typeof _response>['status']>().toEqualTypeOf<number>();

expectTypeOf<keyof typeof stripe.triggers>().toEqualTypeOf<
  | 'paymentSucceeded'
  | 'customerCreated'
  | 'paymentFailed'
  | 'subscriptionCreated'
  | 'chargeSucceeded'
  | 'invoiceCreated'
  | 'invoicePaymentFailed'
  | 'subscriptionCanceled'
  | 'refundCreated'
  | 'disputeCreated'
  | 'paymentLinkCreated'
  | 'subscriptionUpdated'
  | 'checkoutCompleted'
>();
expectTypeOf(stripe.triggers.invoiceCreated.type).toEqualTypeOf<'webhook'>();

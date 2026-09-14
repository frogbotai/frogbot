# `@frogbotai/piece-stripe`

Manage Stripe customers, billing resources, payments, and webhook events.

## Usage

```ts
import { createStripe } from '@frogbotai/piece-stripe';

export const stripe = createStripe({ auth: { apiKey: process.env.STRIPE_SECRET_KEY! } });
```

## Actions

| Upstream action slug      | Previous wrapper export | Native action           | Notes                                        |
| ------------------------- | ----------------------- | ----------------------- | -------------------------------------------- |
| `create_customer`         | `createCustomer`        | `createCustomer`        |                                              |
| `create_invoice`          | `createInvoice`         | `createInvoice`         |                                              |
| `search_customer`         | `searchCustomer`        | `searchCustomers`       | Semantic plural search result.               |
| `search_subscriptions`    | `searchSubscriptions`   | `searchSubscriptions`   | Was omitted from wrapper defaults.           |
| `retrieve_customer`       | `retrieveCustomer`      | `getCustomer`           | Semantic get-by-ID name.                     |
| `update_customer`         | `updateCustomer`        | `updateCustomer`        | Was omitted from wrapper defaults.           |
| `create_payment_intent`   | `createPaymentIntent`   | `createPaymentIntent`   | Was omitted from wrapper defaults.           |
| `create_product`          | `createProduct`         | `createProduct`         | Was omitted from wrapper defaults.           |
| `create_price`            | `createPrice`           | `createPrice`           | Was omitted from wrapper defaults.           |
| `create_subscription`     | `createSubscription`    | `createSubscription`    | Was omitted from wrapper defaults.           |
| `cancel_subscription`     | `cancelSubscription`    | `cancelSubscription`    | Was omitted from wrapper defaults.           |
| `retrieve_invoice`        | `retrieveInvoice`       | `getInvoice`            | Uses dynamic invoice choices.                |
| `retrieve_payout`         | `retrievePayout`        | `getPayout`             | Was omitted from wrapper defaults.           |
| `create_refund`           | `createRefund`          | `createRefund`          |                                              |
| `create_payment_link`     | `createPaymentLink`     | `createPaymentLink`     |                                              |
| `deactivate_payment_link` | `deactivatePaymentLink` | `deactivatePaymentLink` | Was omitted from wrapper defaults.           |
| `retrieve_payment_intent` | `retrievePaymentIntent` | `getPaymentIntent`      | Semantic get-by-ID name.                     |
| `find_invoice`            | `findInvoice`           | `findInvoice`           | Explicit ID variant without dynamic choices. |
| `custom_api_call`         | `customApiCall`         | `sendRequest`           | Authenticated Stripe `/v1` request.          |

## Triggers

| Upstream trigger slug        | Native trigger         | Type      | Stripe event                    |
| ---------------------------- | ---------------------- | --------- | ------------------------------- |
| `new_payment`                | `paymentSucceeded`     | `webhook` | `payment_intent.succeeded`      |
| `new_customer`               | `customerCreated`      | `webhook` | `customer.created`              |
| `payment_failed`             | `paymentFailed`        | `webhook` | `charge.failed`                 |
| `new_subscription`           | `subscriptionCreated`  | `webhook` | `customer.subscription.created` |
| `new_charge`                 | `chargeSucceeded`      | `webhook` | `charge.succeeded`              |
| `new_invoice`                | `invoiceCreated`       | `webhook` | `invoice.created`               |
| `invoice_payment_failed`     | `invoicePaymentFailed` | `webhook` | `invoice.payment_failed`        |
| `canceled_subscription`      | `subscriptionCanceled` | `webhook` | `customer.subscription.deleted` |
| `new_refund`                 | `refundCreated`        | `webhook` | `refund.created`                |
| `new_dispute`                | `disputeCreated`       | `webhook` | `charge.dispute.created`        |
| `new_payment_link`           | `paymentLinkCreated`   | `webhook` | `payment_link.created`          |
| `updated_subscription`       | `subscriptionUpdated`  | `webhook` | `customer.subscription.updated` |
| `checkout_session_completed` | `checkoutCompleted`    | `webhook` | `checkout.session.completed`    |

Stripe creates a dedicated webhook endpoint for each enabled trigger. FrogBot stores its endpoint ID and signing secret, verifies `Stripe-Signature` against the unchanged request body, and removes the endpoint when the trigger is disabled.

Optional filters are available on `invoiceCreated` (`status`, `customerId`, `subscriptionId`), `invoicePaymentFailed`, `subscriptionCanceled`, and `checkoutCompleted` (`customerId`), `refundCreated` and `disputeCreated` (`chargeId`, `paymentIntentId`), and `subscriptionUpdated` (`status`, `customerId`).

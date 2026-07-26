import * as module from '@activepieces/piece-stripe';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const stripeActions = ['create_customer', 'search_customer', 'retrieve_customer', 'update_customer', 'create_invoice', 'retrieve_invoice', 'create_payment_link', 'create_refund'] as const;
export const stripeScopes = [] as const;

export function createStripe(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "stripe",
    credentialType: "secret_text",
    defaultActions: stripeActions,
    scopes: stripeScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Customer: Create a customer in stripe */
    createCustomer: piece.tool("create_customer"),
    /** Create Invoice: Create an Invoice in stripe */
    createInvoice: piece.tool("create_invoice"),
    /** Search Customer: Search for a customer in stripe by email */
    searchCustomer: piece.tool("search_customer"),
    /** Search Subscriptions: Search for subscriptions by price ID, status, customer ID and other filters, including customer details */
    searchSubscriptions: piece.tool("search_subscriptions"),
    /** Retrieve Customer: Retrieve a customer in stripe by id */
    retrieveCustomer: piece.tool("retrieve_customer"),
    /** Update Customer: Modify an existing customer’s details. */
    updateCustomer: piece.tool("update_customer"),
    /** Create Payment (Payment Intent): Creates a new payment intent to start a payment flow. */
    createPaymentIntent: piece.tool("create_payment_intent"),
    /** Create Product: Create a new product object in Stripe. */
    createProduct: piece.tool("create_product"),
    /** Create Price: Create a price (one-time or recurring), associated with a product. */
    createPrice: piece.tool("create_price"),
    /** Create Subscription: Start a subscription for a customer with specified items/prices. */
    createSubscription: piece.tool("create_subscription"),
    /** Cancel Subscription: Cancel an existing subscription, either immediately or at the end of the current billing period. */
    cancelSubscription: piece.tool("cancel_subscription"),
    /** Retrieve an Invoice: Retrieves the details of an existing invoice by its ID. */
    retrieveInvoice: piece.tool("retrieve_invoice"),
    /** Retrieve a Payout: Retrieves the details of an existing payout by its ID. */
    retrievePayout: piece.tool("retrieve_payout"),
    /** Create a Refund: Create a full or partial refund for a payment. */
    createRefund: piece.tool("create_refund"),
    /** Create Payment Link: Creates a shareable, Stripe-hosted payment link for one-time purchases or subscriptions. */
    createPaymentLink: piece.tool("create_payment_link"),
    /** Deactivate Payment Link: Disable or deactivate a Payment Link so it can no longer be used. */
    deactivatePaymentLink: piece.tool("deactivate_payment_link"),
    /** Find Payment (by Payment Intent ID): Retrieves the details of a payment by its unique Payment Intent ID. */
    retrievePaymentIntent: piece.tool("retrieve_payment_intent"),
    /** Find Invoice: Finds an invoice by its unique ID. */
    findInvoice: piece.tool("find_invoice"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

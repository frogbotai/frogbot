# `@frogbotai/piece-xero`

Native Xero accounting actions and event triggers for FrogBot.

## Usage

```ts
import { createXero } from '@frogbotai/piece-xero';

export const xero = createXero({
  oauth: {
    clientId: process.env.XERO_CLIENT_ID!,
    clientSecret: process.env.XERO_CLIENT_SECRET!,
  },
});
```

Xero rotates refresh tokens. FrogBot stores the replacement `refresh_token` returned by each OAuth refresh and maps it back to `refreshToken`. Account identity comes from Xero OpenID Connect user info. Every accounting request requires an explicit organization (`tenantId`) and sends it as `Xero-Tenant-Id`.

## Actions

| Upstream action slug                   | Previous wrapper export           | Native action            | Notes                                                                                                                             |
| -------------------------------------- | --------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `xero_create_contact`                  | `xeroCreateContact`               | `createOrUpdateContact`  |                                                                                                                                   |
| `xero_create_invoice`                  | `xeroCreateInvoice`               | `createOrUpdateInvoice`  |                                                                                                                                   |
| `xero_allocate_credit_note_to_invoice` | `xeroAllocateCreditNoteToInvoice` | `allocateCreditNote`     |                                                                                                                                   |
| `xero_create_bank_transfer`            | `xeroCreateBankTransfer`          | `createBankTransfer`     |                                                                                                                                   |
| `xero_create_quote_draft`              | `xeroCreateQuoteDraft`            | `createQuote`            | Draft only.                                                                                                                       |
| `xero_send_invoice_email`              | `xeroSendInvoiceEmail`            | `sendInvoiceEmail`       |                                                                                                                                   |
| `xero_create_bill`                     | `xeroCreateBill`                  | `createBill`             |                                                                                                                                   |
| `xero_create_payment`                  | `xeroCreatePayment`               | `createPayment`          |                                                                                                                                   |
| `xero_create_purchase_order`           | `xeroCreatePurchaseOrder`         | `createPurchaseOrder`    |                                                                                                                                   |
| `xero_update_purchase_order`           | `xeroUpdatePurchaseOrder`         | `updatePurchaseOrder`    |                                                                                                                                   |
| `xero_upload_attachment`               | `xeroUploadAttachment`            | `uploadAttachment`       | Reads an access-controlled FrogBot file; rejects redirects, cross-origin URLs, credentials, non-HTTPS URLs, and files over 10 MB. |
| `xero_add_items_to_sales_invoice`      | `xeroAddItemsToSalesInvoice`      | `addInvoiceItems`        |                                                                                                                                   |
| `xero_create_credit_note`              | `xeroCreateCreditNote`            | `createCreditNote`       |                                                                                                                                   |
| `xero_create_inventory_item`           | `xeroCreateInventoryItem`         | `createItem`             |                                                                                                                                   |
| `xero_create_project`                  | `xeroCreateProject`               | `createProject`          |                                                                                                                                   |
| `xero_update_sales_invoice`            | `xeroUpdateSalesInvoice`          | `updateInvoice`          |                                                                                                                                   |
| `xero_create_repeating_sales_invoice`  | `xeroCreateRepeatingSalesInvoice` | `createRepeatingInvoice` |                                                                                                                                   |
| `xero_find_contact`                    | `xeroFindContact`                 | `findContact`            |                                                                                                                                   |
| `xero_find_invoice`                    | `xeroFindInvoice`                 | `findInvoice`            |                                                                                                                                   |
| `xero_find_item`                       | `xeroFindItem`                    | `findItem`               |                                                                                                                                   |
| `xero_find_purchase_order`             | `xeroFindPurchaseOrder`           | `findPurchaseOrder`      |                                                                                                                                   |
| `xero_get_invoice_history`             | `xeroGetInvoiceHistory`           | `getInvoiceHistory`      |                                                                                                                                   |
| `xero_create_bank_transaction`         | `xeroCreateBankTransaction`       | `createBankTransaction`  |                                                                                                                                   |
| `xero_find_or_create_contact`          | `xeroFindOrCreateContact`         | `findOrCreateContact`    |                                                                                                                                   |
| `custom_api_call`                      | `customApiCall`                   | `customApiCall`          | Relative accounting API paths only; OAuth authorization and tenant headers cannot be overridden.                                  |

## Triggers

| Upstream trigger slug         | Native trigger            | Type      | Notes                                                  |
| ----------------------------- | ------------------------- | --------- | ------------------------------------------------------ |
| `xero_new_contact`            | `contactCreated`          | `app`     | Shares the app-level Xero webhook.                     |
| `xero_new_or_updated_contact` | `contactCreatedOrUpdated` | `app`     | Shares the app-level Xero webhook.                     |
| `xero_new_sales_invoice`      | `salesInvoiceCreated`     | `app`     | Shares the app-level Xero webhook; bills are excluded. |
| `xero_updated_sales_invoice`  | `salesInvoiceUpdated`     | `app`     | Shares the app-level Xero webhook; bills are excluded. |
| `xero_new_bank_transaction`   | `bankTransactionCreated`  | `polling` | Up to five pages per poll.                             |
| `xero_new_payment`            | `paymentCreated`          | `polling` | Up to five pages per poll.                             |
| `xero_new_purchase_order`     | `purchaseOrderCreated`    | `polling` | Up to five pages per poll.                             |
| `xero_new_reconciled_payment` | `paymentReconciled`       | `polling` | Cursor tracks reconciliation transitions.              |
| `xero_updated_quote`          | `quoteUpdated`            | `polling` | Cursor tracks update timestamps.                       |
| `xero_new_bill`               | `billCreated`             | `polling` | Up to five pages per poll.                             |
| `xero_new_credit_note`        | `creditNoteCreated`       | `polling` | Up to five pages per poll.                             |
| `xero_new_project`            | `projectCreated`          | `polling` | Up to five pages per poll.                             |
| `xero_new_quote`              | `quoteCreated`            | `polling` | Up to five pages per poll.                             |

## Webhook Setup

Xero manages one webhook URL per app rather than exposing webhook registration APIs. Configure `webhookKey` once on the Xero piece instance. In Xero Developer, open the app, choose **Webhooks**, select the Contact and Invoice categories, enter the instance-level webhook URL shown by FrogBot, save it, and validate the **Intent to receive** request.

Every app trigger requires its Xero Organization ID (`tenantId`). Find it in Xero under **Settings > General settings > Organization details** and copy the **Xero organisation ID**. FrogBot rejects every event whose payload `tenantId` does not exactly match this value, including when multiple trigger subscribers share the app-level webhook.

FrogBot validates `x-xero-signature` against the untouched request body with HMAC-SHA256 and a timing-safe comparison before parsing or routing events. Xero's intent-to-receive (ITR) probe is a signed empty-event delivery: a valid probe receives HTTP 200 and an invalid signature receives HTTP 401. Keep at least one app trigger configured so the instance webhook remains mounted.

## Limitations

- Webhook creation and deletion remain manual because Xero does not provide a vendor registration API.
- Polling requests at most five pages per run, then persists the next page and original modification window until all pages have been drained. It retains the latest 5,000 identifiers for overlap deduplication.
- The custom action is intentionally restricted to the Xero accounting API origin and cannot send arbitrary authorization headers.

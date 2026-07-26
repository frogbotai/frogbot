import * as module from "@activepieces/piece-xero";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const xeroActions = [
  "xero_create_contact",
  "xero_create_invoice",
  "xero_create_bill",
  "xero_create_payment",
  "xero_create_purchase_order",
  "xero_update_purchase_order",
  "xero_find_contact",
  "xero_find_invoice",
  "xero_find_item",
  "xero_find_purchase_order",
] as const;
export const xeroScopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.contacts",
  "accounting.transactions",
  "accounting.reports.read",
  "accounting.journals.read",
  "accounting.budgets.read",
  "accounting.attachments",
  "accounting.settings",
  "projects"
] as const;

export function createXero(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "xero",
    credentialType: "oauth2",
    defaultActions: xeroActions,
    scopes: xeroScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create or Update Contact: Create Xero Contact */
    xeroCreateContact: piece.tool("xero_create_contact"),
    /** Create or Update Invoice: Create Xero Invoice */
    xeroCreateInvoice: piece.tool("xero_create_invoice"),
    /** Allocate Credit Note to Invoice: Allocates a credit note to a specific invoice. */
    xeroAllocateCreditNoteToInvoice: piece.tool("xero_allocate_credit_note_to_invoice"),
    /** Create Bank Transfer: Transfers money between two bank accounts in Xero. */
    xeroCreateBankTransfer: piece.tool("xero_create_bank_transfer"),
    /** Create New Quote Draft: Creates a new draft quote. */
    xeroCreateQuoteDraft: piece.tool("xero_create_quote_draft"),
    /** Send Sales Invoice by Email: Sends a sales invoice via email to a contact. */
    xeroSendInvoiceEmail: piece.tool("xero_send_invoice_email"),
    /** Create Bill: Creates a new bill (Accounts Payable). */
    xeroCreateBill: piece.tool("xero_create_bill"),
    /** Create Payment: Applies a payment to an invoice. */
    xeroCreatePayment: piece.tool("xero_create_payment"),
    /** Create Purchase Order: Creates a new purchase order for a contact. */
    xeroCreatePurchaseOrder: piece.tool("xero_create_purchase_order"),
    /** Update Purchase Order: Updates details of an existing purchase order. */
    xeroUpdatePurchaseOrder: piece.tool("xero_update_purchase_order"),
    /** Upload Attachment: Uploads an attachment to a specific Xero resource. */
    xeroUploadAttachment: piece.tool("xero_upload_attachment"),
    /** Add Items to Existing Sales Invoice: Adds line items to an existing sales invoice (ACCREC). */
    xeroAddItemsToSalesInvoice: piece.tool("xero_add_items_to_sales_invoice"),
    /** Create Credit Note: Creates a new credit note for a contact. */
    xeroCreateCreditNote: piece.tool("xero_create_credit_note"),
    /** Create Inventory Item: Creates a new inventory item in Xero. */
    xeroCreateInventoryItem: piece.tool("xero_create_inventory_item"),
    /** Create Project: Creates a new project for a contact. */
    xeroCreateProject: piece.tool("xero_create_project"),
    /** Update Sales Invoice: Updates details of an existing sales invoice (ACCREC). */
    xeroUpdateSalesInvoice: piece.tool("xero_update_sales_invoice"),
    /** Create Repeating Sales Invoice: Creates a repeating sales invoice (Accounts Receivable). */
    xeroCreateRepeatingSalesInvoice: piece.tool("xero_create_repeating_sales_invoice"),
    /** Find Contact: Finds a contact by name or account number (or SearchTerm). */
    xeroFindContact: piece.tool("xero_find_contact"),
    /** Find Invoice: Finds an invoice by number or reference. */
    xeroFindInvoice: piece.tool("xero_find_invoice"),
    /** Find Item: Finds an item by name or code. */
    xeroFindItem: piece.tool("xero_find_item"),
    /** Find Purchase Order: Finds a purchase order by given parameters. */
    xeroFindPurchaseOrder: piece.tool("xero_find_purchase_order"),
    /** Get Invoice History: Returns a list of history records for a given invoice ID. */
    xeroGetInvoiceHistory: piece.tool("xero_get_invoice_history"),
    /** Create Bank Transaction: Creates a new Spend/Receive Money bank transaction. */
    xeroCreateBankTransaction: piece.tool("xero_create_bank_transaction"),
    /** Find or Create Contact: Finds or creates a specific contact. */
    xeroFindOrCreateContact: piece.tool("xero_find_or_create_contact"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

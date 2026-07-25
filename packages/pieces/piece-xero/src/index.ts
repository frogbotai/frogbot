import * as module from "@activepieces/piece-xero";
import { createActivepiecesPiece } from "frogbot/pieces";

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
export const xero = createActivepiecesPiece({
  module,
  service: "xero",
  credentialType: "oauth2",
  defaultActions: xeroActions,
});

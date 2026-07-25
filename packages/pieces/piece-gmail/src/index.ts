import * as module from "@activepieces/piece-gmail";
import { createActivepiecesPiece } from "frogbot/pieces";

export const gmailActions = [
  "send_email",
  "request_approval_in_mail",
  "reply_to_email",
  "create_draft_reply",
  "gmail_get_mail",
  "gmail_search_mail",
] as const;
export const gmail = createActivepiecesPiece({
  module,
  service: "gmail",
  credentialType: "oauth2",
  defaultActions: gmailActions,
});

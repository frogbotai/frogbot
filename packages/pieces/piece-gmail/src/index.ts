import * as module from "@activepieces/piece-gmail";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const gmailActions = [
  "send_email",
  "request_approval_in_mail",
  "reply_to_email",
  "create_draft_reply",
  "gmail_get_mail",
  "gmail_search_mail",
] as const;
export const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "email"
] as const;

export function createGmail(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "gmail",
    credentialType: "oauth2",
    defaultActions: gmailActions,
    scopes: gmailScopes,
    config,
  });
  return Object.assign(piece, {
    /** Send Email: Send an email through a Gmail account */
    sendEmail: piece.tool("send_email"),
    /** Request Approval in Email: Send approval request email and then wait until the email is approved or disapproved */
    requestApprovalInMail: piece.tool("request_approval_in_mail"),
    /** Reply to Email: Reply to an existing email. */
    replyToEmail: piece.tool("reply_to_email"),
    /** Create Draft Reply: Creates a draft reply to an existing email. */
    createDraftReply: piece.tool("create_draft_reply"),
    /** Get Email: Get an email via Id. */
    gmailGetMail: piece.tool("gmail_get_mail"),
    /** Find Email: Find emails using advanced search criteria. If no filters are provided, the latest emails are returned. */
    gmailSearchMail: piece.tool("gmail_search_mail"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

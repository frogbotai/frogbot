import * as module from '@activepieces/piece-resend';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const resendActions = ['send_email'] as const;
export const resendScopes = [] as const;

export function createResend(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "resend",
    credentialType: "secret_text",
    defaultActions: resendActions,
    scopes: resendScopes,
    config,
  });
  return Object.assign(piece, {
    /** Send Email: Send a text or HTML email */
    sendEmail: piece.tool("send_email"),
    /** Send Batch Emails: Send up to 100 emails in a single API call */
    sendBatchEmails: piece.tool("send_batch_emails"),
    /** Get Email Status: Retrieve the delivery status of a sent email */
    getEmailStatus: piece.tool("get_email_status"),
    /** List Sent Emails: Retrieve a list of emails sent from your Resend account */
    listEmails: piece.tool("list_emails"),
    /** Cancel Scheduled Email: Cancel a scheduled email before it is sent */
    cancelScheduledEmail: piece.tool("cancel_scheduled_email"),
    /** Reschedule Email: Update the send time of a scheduled email */
    rescheduleEmail: piece.tool("reschedule_email"),
    /** Create Contact: Add a contact to a Resend audience */
    createContact: piece.tool("create_contact"),
    /** Update Contact: Update the name or subscription status of a contact in an audience */
    updateContact: piece.tool("update_contact"),
    /** Delete Contact: Remove a contact from an audience */
    deleteContact: piece.tool("delete_contact"),
    /** List Contacts: Retrieve all contacts in an audience */
    listContacts: piece.tool("list_contacts"),
    /** List Domains: Retrieve all domains added to your Resend account */
    listDomains: piece.tool("list_domains"),
    /** Create Domain: Add a sending domain to your Resend account and get the DNS records to verify it */
    createDomain: piece.tool("create_domain"),
    /** Delete Domain: Remove a domain from your Resend account */
    deleteDomain: piece.tool("delete_domain"),
    /** Verify Domain: Trigger a DNS verification check for a domain */
    verifyDomain: piece.tool("verify_domain"),
    /** List Audiences: Retrieve all contact audiences in your Resend account */
    listAudiences: piece.tool("list_audiences"),
    /** Create Audience: Create a new contact audience in Resend */
    createAudience: piece.tool("create_audience"),
    /** Delete Audience: Permanently delete an audience and all its contacts */
    deleteAudience: piece.tool("delete_audience"),
    /** List Broadcasts: Retrieve all broadcasts in your Resend account */
    listBroadcasts: piece.tool("list_broadcasts"),
    /** Create Broadcast: Create a new broadcast email to send to an audience */
    createBroadcast: piece.tool("create_broadcast"),
    /** Send Broadcast: Send or schedule a broadcast email to its audience */
    sendBroadcast: piece.tool("send_broadcast"),
    /** Delete Broadcast: Permanently delete a broadcast from your Resend account */
    deleteBroadcast: piece.tool("delete_broadcast"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

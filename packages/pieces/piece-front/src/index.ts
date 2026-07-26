import * as module from '@activepieces/piece-front';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const frontActions = ['addComment', 'assignUnassignConversation', 'createContact', 'findContact', 'findConversation', 'sendMessage', 'sendReply', 'updateConversation'] as const;
export const frontScopes = [] as const;

export function createFront(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "front",
    credentialType: "secret_text",
    defaultActions: frontActions,
    scopes: frontScopes,
    config,
  });
  return Object.assign(piece, {
    /** Add Comment: Add a comment (internal note) to a conversation in Front. */
    addComment: piece.tool("addComment"),
    /** Add Contact Handle: Add a handle (email, phone number, etc.) to an existing Contact. */
    addContactHandle: piece.tool("addContactHandle"),
    /** Add Conversation Links: Link external references (URLs) to a conversation. */
    addConversationLinks: piece.tool("addConversationLinks"),
    /** Add Conversation Tags: Add one or more tags to a conversation. */
    addConversationTags: piece.tool("addConversationTags"),
    /** Assign/Unassign Conversation: Assign a conversation to a teammate or remove assignment. */
    assignUnassignConversation: piece.tool("assignUnassignConversation"),
    /** Create Account: Create a new account in Front. */
    createAccount: piece.tool("createAccount"),
    /** Create Contact: Create a new contact in Front. */
    createContact: piece.tool("createContact"),
    /** Create Draft: Create a draft message in Front. */
    createDraft: piece.tool("createDraft"),
    /** Create Draft Reply: Create a draft reply to an existing conversation (subject/quote etc.) without sending immediately. */
    createDraftReply: piece.tool("createDraftReply"),
    /** Create Link: Create a Link in Front (name, external URL). */
    createLink: piece.tool("createLink"),
    /** Find Account: List company accounts and optionally filter by email domain or external ID. */
    findAccount: piece.tool("findAccount"),
    /** Find Contact: Look up a contact by handle (email, phone, etc.) or other identifying field. */
    findContact: piece.tool("findContact"),
    /** Find Conversation: Find a conversation by search filters such as subject, participants, tags, inbox, etc. */
    findConversation: piece.tool("findConversation"),
    /** Remove Contact Handle: Remove a handle (email, phone number, etc.) from an existing Contact. */
    removeContactHandle: piece.tool("removeContactHandle"),
    /** Remove Conversation Links: Remove external links from a conversation in Front. */
    removeConversationLinks: piece.tool("removeConversationLinks"),
    /** Send Message: Send a new message (starts a conversation) with subject, recipients, body, attachments, tags, etc. */
    sendMessage: piece.tool("sendMessage"),
    /** Send Reply: Send a reply to a conversation in Front. */
    sendReply: piece.tool("sendReply"),
    /** Update Account: Update an existing account in Front. */
    updateAccount: piece.tool("updateAccount"),
    /** Update Contact: Update an existing contact in Front. */
    updateContact: piece.tool("updateContact"),
    /** Update Conversation: Modify conversation properties: status, assignee, inbox, tags, etc. */
    updateConversation: piece.tool("updateConversation"),
    /** Update Link: Update the name or external URL of a Link in Front. */
    updateLink: piece.tool("updateLink"),
  });
}

import * as module from '@activepieces/piece-trello';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const trelloActions = ['create_card', 'get_card', 'update_card', 'delete_card', 'get_card_attachments', 'add_card_attachment'] as const;
export const trelloScopes = [] as const;

export function createTrello(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "trello",
    credentialType: "basic_auth",
    defaultActions: trelloActions,
    scopes: trelloScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Card: Create a new card in Trello */
    createCard: piece.tool("create_card"),
    /** Get Card: Gets a card by ID. */
    getCard: piece.tool("get_card"),
    /** Update Card: Updates an existing card. */
    updateCard: piece.tool("update_card"),
    /** Delete Card: Deletes an existing card. */
    deleteCard: piece.tool("delete_card"),
    /** Get All Card Attachments: Gets all attachments on a card. */
    getCardAttachments: piece.tool("get_card_attachments"),
    /** Add Card Attachment: Adds an attachment to a card. */
    addCardAttachment: piece.tool("add_card_attachment"),
    /** Get Card Attachment: Gets a specific attachment on a card. */
    getCardAttachment: piece.tool("get_card_attachment"),
    /** Delete Card Attachment: Deletes an attachment from a card. */
    deleteCardAttachment: piece.tool("delete_card_attachment"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

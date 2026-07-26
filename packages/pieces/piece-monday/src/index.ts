import * as module from '@activepieces/piece-monday';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const mondayActions = ['monday_create_item', 'monday_create_update', 'monday_get_board_values', 'monday_get_item_column_values', 'monday_update_column_values_of_item'] as const;
export const mondayScopes = [] as const;

export function createMonday(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "monday",
    credentialType: "secret_text",
    defaultActions: mondayActions,
    scopes: mondayScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Column: Creates a new column in board. */
    mondayCreateColumn: piece.tool("monday_create_column"),
    /** Create Group: Creates a new group in board. */
    mondayCreateGroup: piece.tool("monday_create_group"),
    /** Create Item: Creates a new item inside a board. */
    mondayCreateItem: piece.tool("monday_create_item"),
    /** Create Update: Creates a new update. */
    mondayCreateUpdate: piece.tool("monday_create_update"),
    /** Get Board Values: Gets a list of board's items. */
    mondayGetBoardValues: piece.tool("monday_get_board_values"),
    /** Get an Item's Column Values: Gets column values of an item. */
    mondayGetItemColumnValues: piece.tool("monday_get_item_column_values"),
    /** Update Column Values of Specific Item: Updates multiple columns values of specific item. */
    mondayUpdateColumnValuesOfItem: piece.tool("monday_update_column_values_of_item"),
    /** Update Item Name: Updates an item name. */
    mondayUpdateItemName: piece.tool("monday_update_item_name"),
    /** Upload File to Column: Upload a file to a column in Monday. */
    mondayUploadFileToColumn: piece.tool("monday_upload_file_to_column"),
  });
}

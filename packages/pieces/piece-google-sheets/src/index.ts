import * as module from "@activepieces/piece-google-sheets";
import { createActivepiecesPiece } from "frogbot/pieces";

export const googleSheetsActions = [
  "insert_row",
  "insert-row-at-top",
  "google-sheets-insert-multiple-rows",
  "update_row",
  "update-multiple-rows",
  "delete_row",
  "delete-multiple-rows",
  "find_rows",
  "find-or-create-row",
  "create-spreadsheet",
  "create-worksheet",
  "find-or-create-worksheet",
  "clear_sheet",
  "clear-rows",
  "delete-worksheet",
  "rename-worksheet",
  "format-row",
  "find_row_by_num",
  "get_next_rows",
  "get-many-rows",
] as const;
export const googleSheets = createActivepiecesPiece({
  module,
  service: "google-sheets",
  credentialType: "oauth2",
  defaultActions: googleSheetsActions,
});

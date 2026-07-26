import * as module from "@activepieces/piece-google-sheets";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

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
export const googleSheetsScopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive"
] as const;

export function createGoogleSheets(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "google-sheets",
    credentialType: "oauth2",
    defaultActions: googleSheetsActions,
    scopes: googleSheetsScopes,
    config,
  });
  return Object.assign(piece, {
    /** Add Row: Add a new row of data to a specific spreadsheet. */
    insertRow: piece.tool("insert_row"),
    /** Add Row at Top: Inserts a new row at the top of a worksheet, just below the header row. */
    insertRowAtTop: piece.tool("insert-row-at-top"),
    /** Add Multiple Rows: Add multiple rows of data at once to a specific spreadsheet. */
    googleSheetsInsertMultipleRows: piece.tool("google-sheets-insert-multiple-rows"),
    /** Update Row: Update the data in an existing row. */
    updateRow: piece.tool("update_row"),
    /** Update Multiple Rows: Updates multiple rows in a specific spreadsheet. */
    updateMultipleRows: piece.tool("update-multiple-rows"),
    /** Delete Row: Delete a specific row from the selected sheet. */
    deleteRow: piece.tool("delete_row"),
    /** Delete Multiple Rows: Deletes a contiguous range of rows, or a list of specific row numbers. Row numbers are 1-based. */
    deleteMultipleRows: piece.tool("delete-multiple-rows"),
    /** Find Rows: Look up rows in a worksheet based on a column value. */
    findRows: piece.tool("find_rows"),
    /** Find or Create Row: Look up a row by column value; if no match is found, create a new row with the provided values. */
    findOrCreateRow: piece.tool("find-or-create-row"),
    /** Create Spreadsheet: Creates a blank spreadsheet. */
    createSpreadsheet: piece.tool("create-spreadsheet"),
    /** Create Worksheet: Create a new blank worksheet with a title. */
    createWorksheet: piece.tool("create-worksheet"),
    /** Find or Create Worksheet: Look up a worksheet by title in a spreadsheet; if not found, create it with optional headers. */
    findOrCreateWorksheet: piece.tool("find-or-create-worksheet"),
    /** Clear Sheet: Clears all rows on an existing sheet. */
    clearSheet: piece.tool("clear_sheet"),
    /** Clear Row(s): Clears the contents of one or more rows without removing the rows themselves. Useful when you want to keep formatting and references stable. */
    clearRows: piece.tool("clear-rows"),
    /** Delete Worksheet: Permanently delete a specific worksheet. */
    deleteWorksheet: piece.tool("delete-worksheet"),
    /** Rename Worksheet: Rename specific worksheet. */
    renameWorksheet: piece.tool("rename-worksheet"),
    /** Format Row(s): Format one or multiple rows in specific spreadsheet. */
    formatRow: piece.tool("format-row"),
    /** Get Single Row by ID: Retrieve a specific row using its unique ID. */
    findRowByNum: piece.tool("find_row_by_num"),
    /** Get next row(s): Get next group of rows from a specifiec workheet */
    getNextRows: piece.tool("get_next_rows"),
    /** Get All Rows: Get all the rows from a specific sheet. */
    getManyRows: piece.tool("get-many-rows"),
    /** Read Data Range: Read cells from a range using A1 notation (e.g. A1:D10). Returns rows and the resolved range. */
    readDataRange: piece.tool("read-data-range"),
    /** Find Spreadsheet(s): Find spreadsheet(s) by name. */
    findSpreadsheets: piece.tool("find_spreadsheets"),
    /** Find Worksheet(s): Finds a worksheet(s) by title. */
    findWorksheet: piece.tool("find-worksheet"),
    /** Copy Worksheet: Creates a new worksheet by copying an existing one. */
    copyWorksheet: piece.tool("copy-worksheet"),
    /** Create Spreadsheet Column: Creates a new column in a specific spreadsheet. */
    createColumn: piece.tool("create-column"),
    /** Export Worksheet: Download a worksheet as a CSV or TSV file. */
    exportSheet: piece.tool("export_sheet"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

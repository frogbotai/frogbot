import * as module from '@activepieces/piece-csv';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const csvActions = ['convert_csv_to_json', 'convert_json_to_csv'] as const;
export const csvScopes = [] as const;

export function createCsv(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "csv",
    credentialType: "none",
    defaultActions: csvActions,
    scopes: csvScopes,
    config,
  });
  return Object.assign(piece, {
    /** Convert CSV to JSON: This function reads a CSV string and converts it into JSON array format. */
    convertCsvToJson: piece.tool("convert_csv_to_json"),
    /** Convert JSON to CSV: This function reads a JSON array and converts it into CSV format. */
    convertJsonToCsv: piece.tool("convert_json_to_csv"),
    /** Convert Excel to CSV: Converts an Excel file (.xlsx or .xls) into CSV text. */
    convertExcelToCsv: piece.tool("convert_excel_to_csv"),
  });
}

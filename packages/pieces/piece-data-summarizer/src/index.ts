import * as module from '@activepieces/piece-data-summarizer';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const dataSummarizerActions = ['calculateAverage', 'calculateSum', 'countUniques', 'getMinMax'] as const;
export const dataSummarizerScopes = [] as const;

export function createDataSummarizer(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "data_summarizer",
    credentialType: "none",
    defaultActions: dataSummarizerActions,
    scopes: dataSummarizerScopes,
    config,
  });
  return Object.assign(piece, {
    /** Calculate Average: Calculates the average of a list of values. */
    calculateAverage: piece.tool("calculateAverage"),
    /** Calculate Sum: Calculates the sum of a list of values. */
    calculateSum: piece.tool("calculateSum"),
    /** Count Uniques: Counts the number of unique values for multiple fields */
    countUniques: piece.tool("countUniques"),
    /** Find Min and Max: Get the smallest and greatest values from a list of numeric values. */
    getMinMax: piece.tool("getMinMax"),
  });
}

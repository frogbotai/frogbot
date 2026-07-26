import * as module from '@activepieces/piece-date-helper';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const dateHelperActions = ['get_current_date', 'format_date', 'add_subtract_date', 'date_difference', 'extract_date_parts', 'next_day_of_week', 'next_day_of_year', 'first_day_of_previous_month', 'last_day_of_previous_month'] as const;
export const dateHelperScopes = [] as const;

export function createDateHelper(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "date_helper",
    credentialType: "none",
    defaultActions: dateHelperActions,
    scopes: dateHelperScopes,
    config,
  });
  return Object.assign(piece, {
    /** Get Current Date: Get the current date */
    getCurrentDate: piece.tool("get_current_date"),
    /** Format Date: Converts a date from one format to another */
    formatDate: piece.tool("format_date"),
    /** Extract Date Units: Extract date units ( year , month , day , hour , minute , second , day of week , month name ) from a date */
    extractDateParts: piece.tool("extract_date_parts"),
    /** Date Difference: Get the difference between two dates */
    dateDifference: piece.tool("date_difference"),
    /** Add/Subtract Time: Add or subtract time from a date */
    addSubtractDate: piece.tool("add_subtract_date"),
    /** Next Day of Week: Get the date and time of the next day of the week */
    nextDayOfWeek: piece.tool("next_day_of_week"),
    /** Next Day of Year: Get the date and time of the next day of the year */
    nextDayOfYear: piece.tool("next_day_of_year"),
    /** First Day of Previous Month: Get the date and time of the first day of the previous month */
    firstDayOfPreviousMonth: piece.tool("first_day_of_previous_month"),
    /** Last Day of Previous Month: Get the date and time of the last day of the previous month */
    lastDayOfPreviousMonth: piece.tool("last_day_of_previous_month"),
  });
}

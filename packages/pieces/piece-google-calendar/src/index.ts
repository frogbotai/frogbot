import * as module from "@activepieces/piece-google-calendar";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const googleCalendarActions = [
  "google-calendar-add-attendees",
  "create_quick_event",
  "create_google_calendar_event",
  "google_calendar_get_events",
  "update_event",
  "delete_event",
  "google_calendar_find_busy_free_periods",
  "google_calendar_get_event_by_id",
] as const;
export const googleCalendarScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly"
] as const;

export function createGoogleCalendar(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "google-calendar",
    credentialType: "oauth2",
    defaultActions: googleCalendarActions,
    scopes: googleCalendarScopes,
    config,
  });
  return Object.assign(piece, {
    /** Add Attendees to Event: Add one or more person to existing event. */
    googleCalendarAddAttendees: piece.tool("google-calendar-add-attendees"),
    /** Create Quick Event: Add Quick Calendar Event */
    createQuickEvent: piece.tool("create_quick_event"),
    /** Create Event: Add Event */
    createGoogleCalendarEvent: piece.tool("create_google_calendar_event"),
    /** Get all Events: Get Events */
    googleCalendarGetEvents: piece.tool("google_calendar_get_events"),
    /** Update Event: Updates an event in Google Calendar. */
    updateEvent: piece.tool("update_event"),
    /** Delete Event: Deletes an event from Google Calendar. */
    deleteEvent: piece.tool("delete_event"),
    /** Find Busy/Free Periods in Calendar: Finds free/busy calendar details from Google Calendar. */
    googleCalendarFindBusyFreePeriods: piece.tool("google_calendar_find_busy_free_periods"),
    /** Get Event by ID: Fetch event details by its unique ID from Google Calendar. */
    googleCalendarGetEventById: piece.tool("google_calendar_get_event_by_id"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

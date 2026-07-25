import * as module from "@activepieces/piece-google-calendar";
import { createActivepiecesPiece } from "frogbot/pieces";

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
export const googleCalendar = createActivepiecesPiece({
  module,
  service: "google-calendar",
  credentialType: "oauth2",
  defaultActions: googleCalendarActions,
});

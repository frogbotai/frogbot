import * as module from "@activepieces/piece-zoom";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const zoomActions = [
  "zoom_create_meeting",
  "zoom_create_meeting_registrant",
  "zoom_find_meeting",
  "zoom_update_meeting",
] as const;
export const zoomScopes = [] as const;

export function createZoom(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "zoom",
    credentialType: "oauth2",
    defaultActions: zoomActions,
    scopes: zoomScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Zoom Meeting: Create a new Zoom Meeting */
    zoomCreateMeeting: piece.tool("zoom_create_meeting"),
    /** Create Zoom Meeting Registrant: Create and submit a user's registration to a meeting. */
    zoomCreateMeetingRegistrant: piece.tool("zoom_create_meeting_registrant"),
    /** Find Zoom Meeting: Retrieve the details of an existing meeting. */
    zoomFindMeeting: piece.tool("zoom_find_meeting"),
    /** Update Zoom Meeting: Update the details of an existing meeting. */
    zoomUpdateMeeting: piece.tool("zoom_update_meeting"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

import * as module from "@activepieces/piece-zoom";
import { createActivepiecesPiece } from "frogbot/pieces";

export const zoomActions = [
  "zoom_create_meeting",
  "zoom_create_meeting_registrant",
  "zoom_find_meeting",
  "zoom_update_meeting",
] as const;
export const zoom = createActivepiecesPiece({
  module,
  service: "zoom",
  credentialType: "oauth2",
  defaultActions: zoomActions,
});

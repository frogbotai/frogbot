import * as module from "@activepieces/piece-slack";
import { createActivepiecesPiece } from "frogbot/pieces";

export const slackActions = [
  "slack-add-reaction-to-message",
  "send_direct_message",
  "send_channel_message",
  "uploadFile",
  "get-file",
  "searchMessages",
  "slack-find-user-by-email",
  "find-user-by-id",
  "updateMessage",
  "delete-message",
] as const;
export const slack = createActivepiecesPiece({
  module,
  service: "slack",
  credentialType: "oauth2",
  defaultActions: slackActions,
});

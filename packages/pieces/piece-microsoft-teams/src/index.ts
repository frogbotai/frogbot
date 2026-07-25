import * as module from "@activepieces/piece-microsoft-teams";
import { createActivepiecesPiece } from "frogbot/pieces";

export const microsoftTeamsActions = [
  "microsoft_teams_create_channel",
  "microsoft_teams_send_channel_message",
  "microsoft_teams_send_chat_message",
  "microsoft_teams_reply_to_channel_message",
  "microsoft_teams_create_chat_and_send_message",
  "microsoft_teams_create_private_channel",
  "microsoft_teams_get_chat_message",
  "microsoft_teams_get_channel_message",
  "microsoft_teams_find_channel",
  "microsoft_teams_find_team_member",
] as const;
export const microsoftTeams = createActivepiecesPiece({
  module,
  service: "microsoft-teams",
  credentialType: "oauth2",
  defaultActions: microsoftTeamsActions,
});

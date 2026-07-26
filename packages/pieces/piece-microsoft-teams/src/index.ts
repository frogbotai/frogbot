import * as module from "@activepieces/piece-microsoft-teams";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

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
export const microsoftTeamsScopes = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "User.Read",
  "Channel.Create",
  "Channel.ReadBasic.All",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Chat.ReadWrite",
  "ChannelMessage.Read.All",
  "TeamMember.Read.All",
  "User.ReadBasic.All",
  "Presence.Read.All",
  "OnlineMeetingTranscript.Read.All",
  "OnlineMeetingRecording.Read.All"
] as const;

export function createMicrosoftTeams(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "microsoft-teams",
    credentialType: "oauth2",
    defaultActions: microsoftTeamsActions,
    scopes: microsoftTeamsScopes,
    config,
  });
  return Object.assign(piece, {
    /** Create Channel: Create a new channel in Microsoft Teams. */
    microsoftTeamsCreateChannel: piece.tool("microsoft_teams_create_channel"),
    /** Send Channel Message: Sends a message to a teams's channel. */
    microsoftTeamsSendChannelMessage: piece.tool("microsoft_teams_send_channel_message"),
    /** Send Chat Message: Sends a message in an existing chat. */
    microsoftTeamsSendChatMessage: piece.tool("microsoft_teams_send_chat_message"),
    /** Reply to Channel Message: Post a reply to an existing channel message. */
    microsoftTeamsReplyToChannelMessage: piece.tool("microsoft_teams_reply_to_channel_message"),
    /** Create Chat & Send Message: Start a new chat and send an initial message. */
    microsoftTeamsCreateChatAndSendMessage: piece.tool("microsoft_teams_create_chat_and_send_message"),
    /** Create Private Channel: Create a new private channel in a team. */
    microsoftTeamsCreatePrivateChannel: piece.tool("microsoft_teams_create_private_channel"),
    /** Get Chat Message: Fetch a specific chat message by chat and message ID. */
    microsoftTeamsGetChatMessage: piece.tool("microsoft_teams_get_chat_message"),
    /** Delete Chat Message: Soft-Deletes a message in chat.You can only delete messages you sent. */
    microsoftTeamsDeleteChatMessage: piece.tool("microsoft_teams_delete_chat_message"),
    /** Get Channel Message: Fetch a specific channel message by team, channel, and message ID (optionally a reply). */
    microsoftTeamsGetChannelMessage: piece.tool("microsoft_teams_get_channel_message"),
    /** Find Channel: Finds channels by name. */
    microsoftTeamsFindChannel: piece.tool("microsoft_teams_find_channel"),
    /** Find Team Member: Finds a team member by email or display name. */
    microsoftTeamsFindTeamMember: piece.tool("microsoft_teams_find_team_member"),
    /** Get Meeting Transcript: Retrieves transcripts for a Teams meeting. Provide a Transcript to fetch its text content; omit it to list all available transcripts. */
    microsoftTeamsGetMeetingTranscript: piece.tool("microsoft_teams_get_meeting_transcript"),
    /** Get Meeting Recording: Retrieves recordings for a Teams meeting. Provide a Recording to fetch its metadata; omit it to list all available recordings. */
    microsoftTeamsGetMeetingRecording: piece.tool("microsoft_teams_get_meeting_recording"),
    /** Request Approval in Channel: Send approval message to a channel and then wait until the message is approved or disapproved */
    requestApprovalInChannel: piece.tool("request_approval_in_channel"),
    /** Request Approval from a User: Send approval message to a user and then wait until the message is approved or disapproved */
    requestApprovalDirectMessage: piece.tool("request_approval_direct_message"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

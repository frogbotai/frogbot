import * as module from "@activepieces/piece-slack";
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

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
export const slackScopes = [
  "channels:read",
  "channels:manage",
  "channels:history",
  "chat:write",
  "groups:read",
  "groups:write",
  "groups:history",
  "reactions:read",
  "mpim:read",
  "mpim:write",
  "mpim:history",
  "im:write",
  "im:read",
  "im:history",
  "users:read",
  "files:write",
  "files:read",
  "users:read.email",
  "reactions:write",
  "usergroups:read",
  "usergroups:write",
  "chat:write.customize",
  "links:read",
  "links:write",
  "emoji:read",
  "users.profile:read",
  "channels:write.invites",
  "groups:write.invites",
  "channels:join",
  "conversations.connect:write"
] as const;

export function createSlack(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "slack",
    credentialType: "oauth2",
    defaultActions: slackActions,
    scopes: slackScopes,
    config,
  });
  return Object.assign(piece, {
    /** Add Reaction to Message: Add an emoji reaction to a message. */
    slackAddReactionToMessage: piece.tool("slack-add-reaction-to-message"),
    /** Send Message To A User: Send message to a user */
    sendDirectMessage: piece.tool("send_direct_message"),
    /** Send Message To A Channel: Send message to a channel */
    sendChannelMessage: piece.tool("send_channel_message"),
    /** Request Approval from A User: Send approval message to a user and then wait until the message is approved or disapproved */
    requestApprovalDirectMessage: piece.tool("request_approval_direct_message"),
    /** Request Approval in a Channel: Send approval message to a channel and then wait until the message is approved or disapproved */
    requestApprovalMessage: piece.tool("request_approval_message"),
    /** Request Action from A User: Send a message to a user and wait until the user selects an action */
    requestActionDirectMessage: piece.tool("request_action_direct_message"),
    /** Request Action in A Channel: Send a message in a channel and wait until an action is selected */
    requestActionMessage: piece.tool("request_action_message"),
    /** Upload file: Upload file without sharing it to a channel or user */
    uploadFile: piece.tool("uploadFile"),
    /** Get File: Return information about a given file ID. */
    getFile: piece.tool("get-file"),
    /** Search messages: Searches for messages matching a query */
    searchMessages: piece.tool("searchMessages"),
    /** Find User by Email: Finds a user by matching against their email address. */
    slackFindUserByEmail: piece.tool("slack-find-user-by-email"),
    /** Find User by Handle: Finds a user by matching against their Slack handle. */
    slackFindUserByHandle: piece.tool("slack-find-user-by-handle"),
    /** Find User by ID: Finds a user by their ID. */
    findUserById: piece.tool("find-user-by-id"),
    /** List users: List all users of the workspace */
    listUsers: piece.tool("listUsers"),
    /** Update message: Update an existing message */
    updateMessage: piece.tool("updateMessage"),
    /** Delete Message: Deletes a specific message from a channel using the message's timestamp. */
    deleteMessage: piece.tool("delete-message"),
    /** Create Channel: Creates a new channel. */
    slackCreateChannel: piece.tool("slack-create-channel"),
    /** Update Profile: Update basic profile field such as name or title. */
    slackUpdateProfile: piece.tool("slack-update-profile"),
    /** Get channel history: Retrieve all messages from a specific channel ("conversation") between specified timestamps */
    getChannelHistory: piece.tool("getChannelHistory"),
    /** Set User Status: Sets a user's custom status */
    slackSetUserStatus: piece.tool("slack-set-user-status"),
    /** Markdown to Slack format: Convert Markdown-formatted text to Slack's pseudo - markdown syntax */
    markdownToSlackFormat: piece.tool("markdownToSlackFormat"),
    /** Retrieve Thread Messages: Retrieves thread messages by channel and thread timestamp. */
    retrieveThreadMessages: piece.tool("retrieveThreadMessages"),
    /** Set Channel Topic: Sets the topic on a selected channel. */
    setChannelTopic: piece.tool("set-channel-topic"),
    /** Get Message by Timestamp: Retrieves a specific message from a channel history using the message's timestamp. */
    getMessage: piece.tool("get-message"),
    /** Invite User to Channel: Invites an existing User to an existing channel. */
    inviteUserToChannel: piece.tool("invite-user-to-channel"),
    /** Get User Group by Handle: Finds a Slack user group by its handle (e.g., @user-group) and returns its details. To mention this group in a message, map the returned ID using the syntax <!subteam^ID>. Read more: https://api.slack.com/reference/surfaces/formatting#mentioning-groups */
    getGroupByHandle: piece.tool("get_group_by_handle"),
    /** Update User Group Members: Add users to or overwrite the member list of a Slack user group. */
    updateGroupUsers: piece.tool("update_group_users"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

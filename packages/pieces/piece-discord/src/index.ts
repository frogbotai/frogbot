import * as module from '@activepieces/piece-discord';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const discordActions = ['sendMessageWithBot', 'send_message_webhook', 'add_role_to_member', 'remove_role_from_member', 'list_guild_members', 'find_channel'] as const;
export const discordScopes = [] as const;

export function createDiscord(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "discord",
    credentialType: "secret_text",
    defaultActions: discordActions,
    scopes: discordScopes,
    config,
  });
  return Object.assign(piece, {
    /** Send Message with Bot: Send messages via bot to any channel or thread you want, with an optional file attachment. */
    sendMessageWithBot: piece.tool("sendMessageWithBot"),
    /** Send Message Webhook: Send a discord message via webhook */
    sendMessageWebhook: piece.tool("send_message_webhook"),
    /** Request Approval in a Channel: send a message to a channel asking for approval and wait for a response */
    requestApprovalMessage: piece.tool("request_approval_message"),
    /** Add role to member: Add Guild Member Role */
    addRoleToMember: piece.tool("add_role_to_member"),
    /** Remove role from member: Remove Guild Member Role */
    removeRoleFromMember: piece.tool("remove_role_from_member"),
    /** Remove member from guild: Remove Guild Member */
    removeMemberFromGuild: piece.tool("remove_member_from_guild"),
    /** List guild members: List Guild Members */
    listGuildMembers: piece.tool("list_guild_members"),
    /** Rename channel: rename a channel */
    renameChannel: piece.tool("rename_channel"),
    /** Create channel: create a channel */
    createChannel: piece.tool("create_channel"),
    /** Delete channel: delete a channel */
    deleteChannel: piece.tool("delete_channel"),
    /** Find channel: find a channel by name */
    findChannel: piece.tool("find_channel"),
    /** Remove ban from user: Removes the guild ban from a user */
    removeBanFromUser: piece.tool("remove_ban_from_user"),
    /** Create guild role: Creates a new role on the specified guild */
    createGuildRole: piece.tool("createGuildRole"),
    /** Delete guild role: Deletes the specified role from the specified guild */
    deleteGuildRole: piece.tool("deleteGuildRole"),
    /** Ban guild member: Bans a guild member */
    banGuildMember: piece.tool("ban_guild_member"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}

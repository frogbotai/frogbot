import { definePiece } from 'frogbot/pieces';

import {
  addRoleToMember,
  banMember,
  createChannel,
  createRole,
  deleteChannel,
  deleteRole,
  findChannel,
  listMembers,
  removeMember,
  removeRoleFromMember,
  renameChannel,
  sendApiRequest,
  sendMessage,
  sendWebhookMessage,
  unbanMember,
} from './actions.js';
import { createDiscordClient } from './client.js';
import { discordAuth, discordOptions } from './config.js';
import { memberJoined, messageCreated } from './triggers.js';

export const discordActions = [
  'sendMessage',
  'sendWebhookMessage',
  'addRoleToMember',
  'removeRoleFromMember',
  'removeMember',
  'listMembers',
  'renameChannel',
  'createChannel',
  'deleteChannel',
  'findChannel',
  'unbanMember',
  'createRole',
  'deleteRole',
  'banMember',
  'sendApiRequest',
] as const;
export const discordTriggers = ['messageCreated', 'memberJoined'] as const;

export const createDiscord = definePiece({
  slug: 'discord',
  label: 'Discord',
  admin: {
    description: 'Manage Discord messages, channels, members, roles, and polling events',
    group: 'Communication',
  },
  auth: discordAuth,
  options: discordOptions,
  client: createDiscordClient,
  actions: [
    sendMessage,
    sendWebhookMessage,
    addRoleToMember,
    removeRoleFromMember,
    removeMember,
    listMembers,
    renameChannel,
    createChannel,
    deleteChannel,
    findChannel,
    unbanMember,
    createRole,
    deleteRole,
    banMember,
    sendApiRequest,
  ],
  triggers: [messageCreated, memberJoined],
});

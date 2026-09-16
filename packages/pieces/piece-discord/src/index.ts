import { createDiscordAdapter } from '@chat-adapter/discord';
import { definePiece, type PieceChannel, type PieceWebhook } from 'frogbot/pieces';
import type { z } from 'zod';

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
  requestApproval,
  sendApiRequest,
  sendMessage,
  sendWebhookMessage,
  unbanMember,
} from './actions.js';
import { createDiscordClient } from './client.js';
import { discordAuth, discordOptions } from './config.js';
import {
  commandReceived,
  componentReceived,
  messageCreated,
  reactionAdded,
  reactionRemoved,
} from './triggers.js';

export const discordActions = [
  'sendMessage',
  'sendWebhookMessage',
  'requestApproval',
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
export const discordTriggers = [
  'commandReceived',
  'componentReceived',
  'messageCreated',
  'reactionAdded',
  'reactionRemoved',
] as const;

const discordWebhook = {
  parse({ req }) {
    const data = req.data as { type?: unknown } | undefined;

    if (data?.type === 2) return { event: 'commandReceived' };
    if (data?.type === 3) return { event: 'componentReceived' };

    const type = typeof data?.type === 'string' ? data.type : '';

    if (type === 'GATEWAY_MESSAGE_CREATE') return { event: 'messageCreated' };
    if (type === 'GATEWAY_MESSAGE_REACTION_ADD') return { event: 'reactionAdded' };
    if (type === 'GATEWAY_MESSAGE_REACTION_REMOVE') return { event: 'reactionRemoved' };

    return { event: 'unsupportedDiscordEvent' };
  },
} satisfies PieceWebhook<z.output<typeof discordOptions>>;

const discordChannel = {
  adapter({ auth, options }) {
    if (!options.applicationId || !options.publicKey) {
      throw new Error('Discord channels require applicationId and publicKey options.');
    }

    return createDiscordAdapter({
      botToken: auth.botToken,
      applicationId: options.applicationId,
      publicKey: options.publicKey,
      userName: options.botUsername,
      mentionRoleIds: options.mentionRoleIds,
      respondToChannelIds: options.respondToChannelIds,
      respondToGlobalMentions: options.respondToGlobalMentions,
    });
  },
  async identity() {
    return null;
  },
} satisfies PieceChannel<
  z.output<typeof discordAuth>,
  z.output<typeof discordOptions>,
  ReturnType<typeof createDiscordClient>
>;

export const createDiscord = definePiece({
  slug: 'discord',
  label: 'Discord',
  admin: {
    description: 'Manage Discord communities and connect agents to messages and interactions',
    group: 'Communication',
  },
  auth: discordAuth,
  options: discordOptions,
  client: createDiscordClient,
  webhook: discordWebhook,
  channel: discordChannel,
  actions: [
    sendMessage,
    sendWebhookMessage,
    requestApproval,
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
  triggers: [commandReceived, componentReceived, messageCreated, reactionAdded, reactionRemoved],
});

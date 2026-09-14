import type { PieceOption } from 'frogbot/pieces';

import type { SlackClient } from './client.js';

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function channelOptions({ client }: { client: SlackClient }) {
  const channels = await client.paginate({
    path: 'conversations.list',
    body: { types: 'public_channel,private_channel', exclude_archived: true },
    item: 'channels',
    limit: 2000,
  });

  return channels.flatMap((channel): PieceOption[] => {
    if (!channel || typeof channel !== 'object') return [];
    if (!('id' in channel) || !('name' in channel)) return [];

    const value = text(channel.id);
    const label = text(channel.name);

    return value && label ? [{ label, value }] : [];
  });
}

export async function userOptions({ client }: { client: SlackClient }) {
  const users = await client.paginate({
    path: 'users.list',
    item: 'members',
    body: { limit: 1000 },
  });

  return users.flatMap((user): PieceOption[] => {
    if (!user || typeof user !== 'object' || !('id' in user) || !('name' in user)) return [];
    if ('deleted' in user && user.deleted === true) return [];

    const value = text(user.id);
    const label = text(user.name);

    return value && label ? [{ label, value }] : [];
  });
}

export async function userGroupOptions({ client }: { client: SlackClient }) {
  const response = await client.request('usergroups.list');
  const groups = Array.isArray(response.usergroups) ? response.usergroups : [];

  return groups.flatMap((group): PieceOption[] => {
    if (!group || typeof group !== 'object' || !('id' in group)) return [];
    if ('date_delete' in group && Boolean(group.date_delete)) return [];

    const value = text(group.id);
    const label = 'handle' in group ? text(group.handle) : 'name' in group ? text(group.name) : '';

    return value && label ? [{ label, value }] : [];
  });
}

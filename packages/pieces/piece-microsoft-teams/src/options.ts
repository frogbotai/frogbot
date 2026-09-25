import type { FrogBotRequest } from 'frogbot';

import type { MicrosoftTeamsClient } from './client.js';
import { signal } from './client.js';
import { channel, chat, member } from './schemas.js';

type Args = { client: MicrosoftTeamsClient; input: Record<string, unknown>; req: FrogBotRequest };

export async function teams({ client, req }: Args) {
  const items = await client.list('/v1.0/me/joinedTeams', channel, { signal: signal(req) });

  return items.map((item) => ({ label: item.displayName, value: item.id }));
}

export async function channels({ client, input, req }: Args) {
  if (!('teamId' in input) || typeof input.teamId !== 'string') return [];

  const items = await client.list(
    `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels`,
    channel,
    {
      signal: signal(req),
    },
  );

  return items.map((item) => ({ label: item.displayName, value: item.id }));
}

export async function members({ client, input, req }: Args) {
  if (!('teamId' in input) || typeof input.teamId !== 'string') return [];

  const items = await client.list(
    `/v1.0/teams/${encodeURIComponent(input.teamId)}/members`,
    member,
    {
      signal: signal(req),
    },
  );

  return items.map((item) => ({
    label: item.displayName ?? item.email ?? item.id,
    value: item.id,
  }));
}

export async function chats({ client, req }: Args) {
  const items = await client.list('/v1.0/chats', chat, {
    query: { $expand: 'members', $top: 50 },
    signal: signal(req),
  });

  return items.map((item) => ({
    label:
      item.topic ??
      item.members
        ?.map((entry) => entry.displayName)
        .filter(Boolean)
        .join(', ') ??
      item.id,
    value: item.id,
  }));
}

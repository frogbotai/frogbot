import type { FrogbotRequest } from 'frogbot';

import type { DiscordClient } from './client.js';

type OptionArgs = {
  input: Record<string, unknown>;
  client: DiscordClient;
  options: object;
  req: FrogbotRequest;
};

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      )
    : [];
}

function choices(value: unknown) {
  return records(value).flatMap((item) =>
    typeof item.id === 'string' && typeof item.name === 'string'
      ? [{ label: item.name, value: item.id }]
      : [],
  );
}

export async function guildOptions({ client }: OptionArgs) {
  const response = await client.request({ path: '/users/@me/guilds' });

  return choices(response.body);
}

export async function channelOptions({ client }: OptionArgs) {
  const guilds = await client.request({ path: '/users/@me/guilds' });
  const result = await Promise.all(
    records(guilds.body).flatMap((guild) =>
      typeof guild.id === 'string'
        ? [client.request({ path: `/guilds/${encodeURIComponent(guild.id)}/channels` })]
        : [],
    ),
  );

  return result.flatMap((response) => choices(response.body));
}

export async function roleOptions({ client, input }: OptionArgs) {
  if (typeof input.guildId !== 'string') return [];

  const response = await client.request({
    path: `/guilds/${encodeURIComponent(input.guildId)}/roles`,
  });

  return choices(response.body);
}

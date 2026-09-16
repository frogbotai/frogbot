import { type PieceActionDefinition, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { type DiscordClient, discordObject, discordResponse } from './client.js';
import { channelId, guildId, roleId } from './config.js';
import { discordAttachment, loadDiscordAttachment } from './files.js';
import { channelOptions, guildOptions, roleOptions } from './options.js';

type Run<T> = PieceRunArgs<T, object, DiscordClient>;
type ActionOptions<TSchema extends z.ZodType> = NonNullable<
  PieceActionDefinition<TSchema, typeof success, object, DiscordClient>['options']
>;

const success = z.object({ success: z.boolean() });
const createdChannel = success.extend({ channel: z.object({ id: z.string(), name: z.string() }) });
const createdRole = success.extend({ role: z.object({ id: z.string(), name: z.string() }) });
const optionsOutput = z.array(z.object({ label: z.string(), value: z.string() }));
const memberInput = z.object({ guildId, userId: z.string().min(1) });
const memberRoleInput = memberInput.extend({ roleId });

function statusAction<TSchema extends z.ZodType>({
  slug,
  description,
  input,
  method,
  path,
  options,
  idempotent = true,
}: {
  slug: string;
  description: string;
  input: TSchema;
  method: string;
  path: (input: z.output<TSchema>) => string;
  options: ActionOptions<TSchema>;
  idempotent?: boolean;
}) {
  return {
    slug,
    description,
    input,
    output: success,
    idempotent,
    options,
    async run({ client, input: value }: Run<z.output<TSchema>>) {
      await client.request({ method, path: path(value) });

      return { success: true };
    },
  } satisfies PieceActionDefinition<TSchema, typeof success, object, DiscordClient>;
}

const sendMessageInput = z
  .object({
    channelId,
    message: z.string().min(1).optional(),
    attachments: z.array(discordAttachment).default([]),
  })
  .refine(({ message, attachments }) => message !== undefined || attachments.length > 0, {
    message: 'A message or attachment is required.',
  });

export const sendMessage = {
  slug: 'sendMessage',
  description: 'Send a bot-authored message and optional file attachments to a channel.',
  input: sendMessageInput,
  output: discordObject,
  idempotent: false,
  options: { channelId: channelOptions },
  async run({ client, input, req }: Run<z.output<typeof sendMessageInput>>) {
    const form = new FormData();

    if (input.message !== undefined) form.set('content', input.message);

    const attachments = await Promise.all(
      input.attachments.map((attachment) => loadDiscordAttachment(req, attachment)),
    );

    attachments.forEach((attachment, index) => {
      form.append(
        `files[${index}]`,
        new Blob([attachment.data], { type: attachment.type }),
        attachment.name,
      );
    });

    const response = await client.request({
      method: 'POST',
      path: `/channels/${encodeURIComponent(input.channelId)}/messages`,
      body: form,
    });

    return discordObject.parse(response.body);
  },
} satisfies PieceActionDefinition<
  typeof sendMessageInput,
  typeof discordObject,
  object,
  DiscordClient
>;

const requestApprovalInput = z.object({
  channelId,
  message: z.string().min(1),
  reviewUrl: z.url(),
  buttonLabel: z.string().min(1).default('Review request'),
});

export const requestApproval = {
  slug: 'requestApproval',
  description: 'Send a message with a link to a workflow-provided approval page.',
  input: requestApprovalInput,
  output: discordObject,
  idempotent: false,
  options: { channelId: channelOptions },
  async run({ client, input }: Run<z.output<typeof requestApprovalInput>>) {
    const response = await client.request({
      method: 'POST',
      path: `/channels/${encodeURIComponent(input.channelId)}/messages`,
      body: {
        content: input.message,
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 5, label: input.buttonLabel, url: input.reviewUrl }],
          },
        ],
      },
    });

    return discordObject.parse(response.body);
  },
} satisfies PieceActionDefinition<
  typeof requestApprovalInput,
  typeof discordObject,
  object,
  DiscordClient
>;

const webhookInput = z.object({
  webhookUrl: z.url().refine(
    (value) => {
      const url = new URL(value);

      return (
        ['discord.com', 'discordapp.com'].includes(url.hostname) &&
        /^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname) &&
        !url.username &&
        !url.password
      );
    },
    {
      message: 'Webhook URL must be a Discord incoming webhook URL.',
    },
  ),
  username: z.string().optional(),
  content: z.string(),
  avatarUrl: z.url().optional(),
  embeds: z.array(discordObject).default([]),
  tts: z.boolean().default(false),
});

export const sendWebhookMessage = {
  slug: 'sendWebhookMessage',
  description: 'Send a message through a Discord incoming webhook.',
  input: webhookInput,
  output: success,
  idempotent: false,
  async run({ client, input }: Run<z.output<typeof webhookInput>>) {
    await client.request({
      method: 'POST',
      path: input.webhookUrl,
      authenticated: false,
      body: {
        username: input.username,
        content: input.content,
        avatar_url: input.avatarUrl,
        embeds: input.embeds,
        tts: input.tts,
      },
    });

    return { success: true };
  },
} satisfies PieceActionDefinition<typeof webhookInput, typeof success, object, DiscordClient>;

export const addRoleToMember = statusAction({
  slug: 'addRoleToMember',
  description: 'Add a role to a guild member.',
  input: memberRoleInput,
  method: 'PUT',
  path: ({ guildId, userId, roleId }) =>
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
  options: { guildId: guildOptions, roleId: roleOptions },
});

export const removeRoleFromMember = statusAction({
  slug: 'removeRoleFromMember',
  description: 'Remove a role from a guild member.',
  input: memberRoleInput,
  method: 'DELETE',
  path: ({ guildId, userId, roleId }) =>
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
  options: { guildId: guildOptions, roleId: roleOptions },
});

export const removeMember = statusAction({
  slug: 'removeMember',
  description: 'Remove a member from a guild.',
  input: memberInput,
  method: 'DELETE',
  path: ({ guildId, userId }) =>
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
  options: { guildId: guildOptions },
});

const listMembersInput = z.object({
  guildId,
  search: z.string(),
  limit: z.number().int().min(1).max(1000).default(1000),
});

export const listMembers = {
  slug: 'listMembers',
  description: 'List guild members as user choices.',
  input: listMembersInput,
  output: optionsOutput,
  idempotent: true,
  options: { guildId: guildOptions },
  async run({ client, input }: Run<z.output<typeof listMembersInput>>) {
    const members: unknown[] = [];
    let after: string | undefined;

    do {
      const query = new URLSearchParams({ limit: String(input.limit) });

      if (after) query.set('after', after);

      const response = await client.request({
        path: `/guilds/${encodeURIComponent(input.guildId)}/members?${query}`,
      });
      const page = Array.isArray(response.body) ? response.body : [];

      members.push(...page);
      after =
        page.length === input.limit
          ? String((page.at(-1) as { user?: { id?: unknown } } | undefined)?.user?.id ?? '') ||
            undefined
          : undefined;
    } while (after);

    return members.flatMap((member) => {
      if (!member || typeof member !== 'object' || !('user' in member)) return [];

      const user = member.user;

      if (!user || typeof user !== 'object' || !('id' in user) || !('username' in user)) return [];
      if (typeof user.id !== 'string' || typeof user.username !== 'string') return [];
      if (!user.username.toLowerCase().includes(input.search.toLowerCase())) return [];

      return [{ label: user.username, value: user.id }];
    });
  },
} satisfies PieceActionDefinition<
  typeof listMembersInput,
  typeof optionsOutput,
  object,
  DiscordClient
>;

const renameChannelInput = z.object({ channelId, name: z.string().min(1) });

export const renameChannel = {
  slug: 'renameChannel',
  description: 'Rename a Discord channel.',
  input: renameChannelInput,
  output: discordObject,
  idempotent: true,
  options: { channelId: channelOptions },
  async run({ client, input }: Run<z.output<typeof renameChannelInput>>) {
    const response = await client.request({
      method: 'PATCH',
      path: `/channels/${encodeURIComponent(input.channelId)}`,
      body: { name: input.name },
    });

    return discordObject.parse(response.body);
  },
} satisfies PieceActionDefinition<
  typeof renameChannelInput,
  typeof discordObject,
  object,
  DiscordClient
>;

const createChannelInput = z.object({
  guildId,
  name: z.string().min(1),
  topic: z.string().optional(),
});

export const createChannel = {
  slug: 'createChannel',
  description: 'Create a channel in a guild.',
  input: createChannelInput,
  output: createdChannel,
  idempotent: false,
  options: { guildId: guildOptions },
  async run({ client, input }: Run<z.output<typeof createChannelInput>>) {
    const response = await client.request({
      method: 'POST',
      path: `/guilds/${encodeURIComponent(input.guildId)}/channels`,
      body: { name: input.name, topic: input.topic },
    });
    const channel = z.object({ id: z.string(), name: z.string() }).parse(response.body);

    return { success: true, channel };
  },
} satisfies PieceActionDefinition<
  typeof createChannelInput,
  typeof createdChannel,
  object,
  DiscordClient
>;

const deleteChannelInput = z.object({ channelId });

export const deleteChannel = {
  slug: 'deleteChannel',
  description: 'Permanently delete a Discord channel.',
  input: deleteChannelInput,
  output: discordObject,
  idempotent: true,
  options: { channelId: channelOptions },
  async run({ client, input }: Run<z.output<typeof deleteChannelInput>>) {
    const response = await client.request({
      method: 'DELETE',
      path: `/channels/${encodeURIComponent(input.channelId)}`,
    });

    return discordObject.parse(response.body);
  },
} satisfies PieceActionDefinition<
  typeof deleteChannelInput,
  typeof discordObject,
  object,
  DiscordClient
>;

const findChannelInput = z.object({ guildId, name: z.string().min(1) });
const findChannelOutput = z.object({ success: z.boolean(), channelId: z.string().optional() });

export const findChannel = {
  slug: 'findChannel',
  description: 'Find a guild channel by exact name.',
  input: findChannelInput,
  output: findChannelOutput,
  idempotent: true,
  options: { guildId: guildOptions },
  async run({ client, input }: Run<z.output<typeof findChannelInput>>) {
    const response = await client.request({
      path: `/guilds/${encodeURIComponent(input.guildId)}/channels`,
    });
    const channels = Array.isArray(response.body) ? response.body : [];
    const channel = channels.find(
      (value) => value && typeof value === 'object' && value.name === input.name,
    );
    const id =
      channel && typeof channel === 'object' && typeof channel.id === 'string'
        ? channel.id
        : undefined;

    return { success: id !== undefined, channelId: id };
  },
} satisfies PieceActionDefinition<
  typeof findChannelInput,
  typeof findChannelOutput,
  object,
  DiscordClient
>;

const moderationInput = memberInput.extend({ reason: z.string().optional() });

function moderationAction(method: string, slug: string, resource: 'bans') {
  return {
    slug,
    description: `${method === 'PUT' ? 'Ban' : 'Unban'} a guild member.`,
    input: moderationInput,
    output: success,
    idempotent: true,
    options: { guildId: guildOptions },
    async run({ client, input }: Run<z.output<typeof moderationInput>>) {
      await client.request({
        method,
        path: `/guilds/${encodeURIComponent(input.guildId)}/${resource}/${encodeURIComponent(input.userId)}`,
        headers: input.reason ? { 'X-Audit-Log-Reason': input.reason } : undefined,
      });

      return { success: true };
    },
  } satisfies PieceActionDefinition<typeof moderationInput, typeof success, object, DiscordClient>;
}

export const unbanMember = moderationAction('DELETE', 'unbanMember', 'bans');
export const banMember = moderationAction('PUT', 'banMember', 'bans');

const createRoleInput = z.object({
  guildId,
  name: z.string().min(1),
  color: z.coerce.number().int().min(0).max(0xffffff).optional(),
  displaySeparately: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  reason: z.string().optional(),
});

export const createRole = {
  slug: 'createRole',
  description: 'Create a role in a guild.',
  input: createRoleInput,
  output: createdRole,
  idempotent: false,
  options: { guildId: guildOptions },
  async run({ client, input }: Run<z.output<typeof createRoleInput>>) {
    const response = await client.request({
      method: 'POST',
      path: `/guilds/${encodeURIComponent(input.guildId)}/roles`,
      headers: input.reason ? { 'X-Audit-Log-Reason': input.reason } : undefined,
      body: {
        name: input.name,
        color: input.color,
        hoist: input.displaySeparately,
        mentionable: input.mentionable,
      },
    });
    const role = z.object({ id: z.string(), name: z.string() }).parse(response.body);

    return { success: true, role };
  },
} satisfies PieceActionDefinition<
  typeof createRoleInput,
  typeof createdRole,
  object,
  DiscordClient
>;

const deleteRoleInput = z.object({ guildId, roleId, reason: z.string().optional() });

export const deleteRole = {
  slug: 'deleteRole',
  description: 'Delete a role from a guild.',
  input: deleteRoleInput,
  output: success,
  idempotent: true,
  options: { guildId: guildOptions, roleId: roleOptions },
  async run({ client, input }: Run<z.output<typeof deleteRoleInput>>) {
    await client.request({
      method: 'DELETE',
      path: `/guilds/${encodeURIComponent(input.guildId)}/roles/${encodeURIComponent(input.roleId)}`,
      headers: input.reason ? { 'X-Audit-Log-Reason': input.reason } : undefined,
    });

    return { success: true };
  },
} satisfies PieceActionDefinition<typeof deleteRoleInput, typeof success, object, DiscordClient>;

const customApiInput = z.object({
  path: z.string().regex(/^\/(?!\/)/, 'Path must be relative to the Discord API.'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  headers: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.unknown().optional(),
});

export const sendApiRequest = {
  slug: 'sendApiRequest',
  description: 'Send an authenticated request to a relative Discord API path.',
  input: customApiInput,
  output: discordResponse,
  idempotent: false,
  async run({ client, input }: Run<z.output<typeof customApiInput>>) {
    const url = new URL(`https://discord.com${input.path}`);

    for (const [key, value] of Object.entries(input.queryParams)) {
      url.searchParams.set(key, String(value));
    }

    return client.request({
      method: input.method,
      path: `${url.pathname}${url.search}`,
      headers: input.headers,
      body: input.body as Record<string, unknown> | undefined,
    });
  },
} satisfies PieceActionDefinition<
  typeof customApiInput,
  typeof discordResponse,
  object,
  DiscordClient
>;

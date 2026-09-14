import { createHash } from 'node:crypto';

import type { PieceAppTrigger, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { type SlackClient, slackValue } from './client.js';
import { slackEvent, slackWorkspace } from './webhook.js';

type Args<T> = PieceRunArgs<T, { signingSecret?: string }, SlackClient>;

const emptyInput = z.object({});
const messageFilters = {
  ignoreBots: z.boolean().default(false),
};
const selfFilters = {
  ...messageFilters,
  ignoreSelfMessages: z.boolean().default(false),
};
const channel = z.string().min(1).meta({ label: 'Channel ID' });
const user = z.string().min(1).meta({ label: 'User ID' });
const eventOutput = slackValue;

function appTrigger<TInput extends z.ZodType>(
  trigger: PieceAppTrigger<TInput, typeof eventOutput, { signingSecret?: string }, SlackClient>,
) {
  return trigger;
}

async function event(args: Args<unknown>) {
  const deliveredWorkspace = slackWorkspace(args.req);

  if (!deliveredWorkspace || deliveredWorkspace !== (await args.client.workspaceId())) {
    return undefined;
  }

  return slackEvent(args.req);
}

function emit(value: Record<string, unknown> | undefined) {
  return value
    ? [
        {
          dedupeKey: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
          data: value,
        },
      ]
    : [];
}

function field(value: Record<string, unknown>, key: string) {
  return key in value ? value[key] : undefined;
}

function eventMap(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

async function selfUser(client: SlackClient) {
  const response = await client.request('auth.test');

  return typeof response.user_id === 'string' ? response.user_id : undefined;
}

function command(text: unknown, userId: string, commands: string[]) {
  if (typeof text !== 'string') return undefined;

  const match = text.match(new RegExp(`<@${userId}>\\s+(.+)`, 's'));

  if (!match) return undefined;

  const parts = match[1].trim().split(/\s+/);
  const name = parts[0].toLowerCase();

  return commands.includes(name) ? { command: name, args: parts.slice(1) } : undefined;
}

const anyMessageInput = z.object(messageFilters);

export const messageCreated = appTrigger({
  slug: 'messageCreated',
  description: 'Trigger for a message in any public or private channel.',
  type: 'app',
  event: 'message',
  input: anyMessageInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof anyMessageInput>>) {
    const value = await event(args);

    if (!value || !['channel', 'group'].includes(String(field(value, 'channel_type')))) return [];
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];

    return emit(value);
  },
});

const channelMessageInput = anyMessageInput.extend({ channel });

export const channelMessageCreated = appTrigger({
  slug: 'channelMessageCreated',
  description: 'Trigger for a message in one selected channel.',
  type: 'app',
  event: 'message',
  input: channelMessageInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof channelMessageInput>>) {
    const value = await event(args);

    if (!value || !['channel', 'group'].includes(String(field(value, 'channel_type')))) return [];
    if (field(value, 'channel') !== args.input.channel) return [];
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];

    return emit(value);
  },
});

const directMessageInput = z.object(selfFilters);

export const directMessageCreated = appTrigger({
  slug: 'directMessageCreated',
  description: 'Trigger for a new direct message.',
  type: 'app',
  event: 'message',
  input: directMessageInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof directMessageInput>>) {
    const value = await event(args);

    if (!value || field(value, 'channel_type') !== 'im') return [];
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];
    if (args.input.ignoreSelfMessages && field(value, 'user') === (await selfUser(args.client))) {
      return [];
    }

    return emit(value);
  },
});

const mentionInput = z.object({
  users: z.array(z.string()).default([]).meta({ label: 'User IDs' }),
  userGroups: z.array(z.string()).default([]).meta({ label: 'User group IDs' }),
  channels: z.array(z.string()).default([]).meta({ label: 'Channel IDs' }),
  ignoreBots: z.boolean().default(false),
  removeMention: z.boolean().default(false),
});

export const channelMentionCreated = appTrigger({
  slug: 'channelMentionCreated',
  description: 'Trigger when selected users or user groups are mentioned in a channel.',
  type: 'app',
  event: 'message',
  input: mentionInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof mentionInput>>) {
    const value = await event(args);

    if (!value || !['channel', 'group'].includes(String(field(value, 'channel_type')))) return [];
    if (
      args.input.channels.length &&
      !args.input.channels.includes(String(field(value, 'channel')))
    ) {
      return [];
    }
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];

    const text = String(field(value, 'text') ?? '');
    const users = args.input.users.filter((id) => text.includes(`<@${id}>`));
    const groups = args.input.userGroups.filter((id) => text.includes(`<!subteam^${id}`));

    if (!users.length && !groups.length) return [];
    if (!args.input.removeMention) return emit(value);

    let cleanText = text;

    for (const id of users) cleanText = cleanText.replaceAll(`<@${id}>`, '');

    for (const id of groups) {
      cleanText = cleanText.replace(new RegExp(`<!subteam\\^${id}(\\|[^>]*)?>`, 'g'), '');
    }

    return emit({ ...value, clean_text: cleanText.trim() });
  },
});

const reactionInput = z.object({
  emojis: z.array(z.string()).default([]),
  user: z.string().optional().meta({ label: 'User ID' }),
  channels: z.array(z.string()).default([]).meta({ label: 'Channel IDs' }),
});

function reactionTrigger(slug: string, eventName: string, description: string) {
  return appTrigger({
    slug,
    description,
    type: 'app',
    event: eventName,
    input: reactionInput,
    output: eventOutput,
    async run(args: Args<z.output<typeof reactionInput>>) {
      const value = await event(args);

      if (!value) return [];
      if (args.input.user && field(value, 'user') !== args.input.user) return [];
      if (
        args.input.emojis.length &&
        !args.input.emojis.includes(String(field(value, 'reaction')))
      ) {
        return [];
      }

      const item = eventMap(field(value, 'item'));
      const itemChannel = item ? field(item, 'channel') : undefined;

      if (args.input.channels.length && !args.input.channels.includes(String(itemChannel))) {
        return [];
      }

      return emit(value);
    },
  });
}

export const reactionAdded = reactionTrigger(
  'reactionAdded',
  'reaction_added',
  'Trigger when a reaction is added.',
);
export const reactionRemoved = reactionTrigger(
  'reactionRemoved',
  'reaction_removed',
  'Trigger when a reaction is removed.',
);

export const channelCreated = appTrigger({
  slug: 'channelCreated',
  description: 'Trigger when a Slack channel is created.',
  type: 'app',
  event: 'channel_created',
  input: emptyInput,
  output: eventOutput,
  async run(args: Args<object>) {
    return emit(await event(args));
  },
});

const commandInput = z.object({
  user,
  commands: z.array(z.string().min(1)).min(1).default(['help']),
  channels: z.array(z.string()).default([]).meta({ label: 'Channel IDs' }),
  ignoreBots: z.boolean().default(true),
});

export const channelCommandCreated = appTrigger({
  slug: 'channelCommandCreated',
  description: 'Trigger for a configured bot command in a channel.',
  type: 'app',
  event: 'message',
  input: commandInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof commandInput>>) {
    const value = await event(args);

    if (!value || !['channel', 'group'].includes(String(field(value, 'channel_type')))) return [];
    if (
      args.input.channels.length &&
      !args.input.channels.includes(String(field(value, 'channel')))
    ) {
      return [];
    }
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];

    const parsed = command(field(value, 'text'), args.input.user, args.input.commands);

    return parsed ? emit({ ...value, parsed_command: parsed }) : [];
  },
});

const directMentionInput = z.object({ user, ...selfFilters });

export const directMentionCreated = appTrigger({
  slug: 'directMentionCreated',
  description: 'Trigger when a selected user is mentioned in a direct message.',
  type: 'app',
  event: 'message',
  input: directMentionInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof directMentionInput>>) {
    const value = await event(args);

    if (!value || field(value, 'channel_type') !== 'im') return [];
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];
    if (args.input.ignoreSelfMessages && field(value, 'user') === (await selfUser(args.client))) {
      return [];
    }

    return String(field(value, 'text') ?? '').includes(`<@${args.input.user}>`) ? emit(value) : [];
  },
});

const directCommandInput = commandInput
  .omit({ channels: true })
  .extend({ ignoreSelfMessages: z.boolean().default(false) });

export const directCommandCreated = appTrigger({
  slug: 'directCommandCreated',
  description: 'Trigger for a configured bot command in a direct message.',
  type: 'app',
  event: 'message',
  input: directCommandInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof directCommandInput>>) {
    const value = await event(args);

    if (!value || field(value, 'channel_type') !== 'im') return [];
    if (args.input.ignoreBots && field(value, 'bot_id')) return [];
    if (args.input.ignoreSelfMessages && field(value, 'user') === (await selfUser(args.client))) {
      return [];
    }

    const parsed = command(field(value, 'text'), args.input.user, args.input.commands);

    return parsed ? emit({ ...value, parsed_command: parsed }) : [];
  },
});

export const userJoined = appTrigger({
  slug: 'userJoined',
  description: 'Trigger when a new user joins the workspace.',
  type: 'app',
  event: 'team_join',
  input: emptyInput,
  output: eventOutput,
  async run(args: Args<object>) {
    const value = await event(args);

    if (!value || field(value, 'type') !== 'team_join') return [];

    const joined = eventMap(field(value, 'user'));

    return emit(joined);
  },
});

export const messageSaved = appTrigger({
  slug: 'messageSaved',
  description: 'Trigger when the connected user saves a message.',
  type: 'app',
  event: 'star_added',
  input: emptyInput,
  output: eventOutput,
  async run(args: Args<object>) {
    const value = await event(args);

    if (!value || field(value, 'type') !== 'star_added') return [];

    const item = eventMap(field(value, 'item'));

    return item && field(item, 'type') === 'message' ? emit(item) : [];
  },
});

export const customEmojiAdded = appTrigger({
  slug: 'customEmojiAdded',
  description: 'Trigger when a custom emoji is added to the workspace.',
  type: 'app',
  event: 'emoji_changed',
  input: emptyInput,
  output: eventOutput,
  async run(args: Args<object>) {
    const value = await event(args);

    if (!value || field(value, 'type') !== 'emoji_changed' || field(value, 'subtype') !== 'add') {
      return [];
    }

    return emit({ id: field(value, 'name'), image: field(value, 'value') });
  },
});

const modalInput = z.object({
  interactionType: z.enum(['view_submission', 'view_closed']).default('view_submission'),
});

export const modalInteraction = appTrigger({
  slug: 'modalInteraction',
  description: 'Trigger when a Slack modal is submitted or closed.',
  type: 'app',
  event: 'modal_interaction',
  input: modalInput,
  output: eventOutput,
  async run(args: Args<z.output<typeof modalInput>>) {
    const value = await event(args);

    if (!value || field(value, 'type') !== args.input.interactionType) return [];

    const safe = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'token'));

    return emit(safe);
  },
});

export const slackTriggers = [
  messageCreated,
  channelMessageCreated,
  directMessageCreated,
  channelMentionCreated,
  directMentionCreated,
  reactionAdded,
  reactionRemoved,
  channelCreated,
  channelCommandCreated,
  directCommandCreated,
  userJoined,
  messageSaved,
  customEmojiAdded,
  modalInteraction,
];

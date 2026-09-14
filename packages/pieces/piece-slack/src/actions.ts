import type { PieceActionDefinition, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import {
  slackApiResult,
  type SlackClient,
  slackResponse,
  type SlackToken,
  slackValue,
  slackValues,
} from './client.js';
import { loadSlackFile, slackFile } from './files.js';
import { channelOptions, userOptions } from './options.js';

type Args<T> = PieceRunArgs<T, { signingSecret?: string }, SlackClient>;

function action<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: PieceActionDefinition<
    TInput,
    TOutput,
    { signingSecret?: string },
    SlackClient,
    z.output<TOutput>
  >,
) {
  return definition;
}

const channel = z.string().min(1).meta({ label: 'Channel' });
const user = z.string().min(1).meta({ label: 'User' });
const timestamp = z.string().regex(/^(?:.*\/p\d{16}|\d+\.\d{6})$/, 'Invalid Slack timestamp.');
const blocks = z.array(slackValue).default([]);
const messageResult = slackResponse.extend({
  channel: z.string().optional(),
  ts: z.string().optional(),
});

function normalizeTimestamp(value: string) {
  const link = value.match(/\/p(\d+)(\d{6})$/);

  return link ? `${link[1]}.${link[2]}` : value;
}

async function upload({
  client,
  file,
  channelId,
  title,
  initialComment,
  threadTimestamp,
  token = 'bot',
  signal,
}: {
  client: SlackClient;
  file: { data: Blob; name: string };
  channelId?: string;
  title?: string;
  initialComment?: string;
  threadTimestamp?: string;
  token?: SlackToken;
  signal?: AbortSignal;
}) {
  const created = await client.request(
    'files.getUploadURLExternal',
    { filename: file.name, length: file.data.size },
    token,
  );
  const uploadUrl =
    typeof created.upload_url === 'string' ? new URL(created.upload_url) : undefined;
  const fileId = typeof created.file_id === 'string' ? created.file_id : undefined;

  if (
    !uploadUrl ||
    !fileId ||
    uploadUrl.protocol !== 'https:' ||
    uploadUrl.username ||
    uploadUrl.password
  ) {
    throw new Error('Slack returned an invalid file upload target.');
  }

  if (uploadUrl.hostname !== 'files.slack.com' && !uploadUrl.hostname.endsWith('.slack.com')) {
    throw new Error('Slack returned an untrusted file upload target.');
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: file.data,
    redirect: 'error',
    signal,
  });

  if (!response.ok) throw new Error(`Slack file upload failed (${response.status}).`);

  return client.request(
    'files.completeUploadExternal',
    {
      files: [{ id: fileId, title }],
      channel_id: channelId,
      initial_comment: initialComment,
      thread_ts: threadTimestamp,
    },
    token,
  );
}

const messageFields = {
  text: z.string().min(1),
  username: z.string().optional(),
  profilePicture: z.url().optional(),
  iconEmoji: z.string().optional(),
  blocks,
  unfurlLinks: z.boolean().default(true),
};
const sendDirectMessageInput = z.object({ userId: user, ...messageFields });

export const sendDirectMessage = action({
  slug: 'sendDirectMessage',
  description: 'Send a direct message to a Slack user.',
  input: sendDirectMessageInput,
  output: messageResult,
  idempotent: false,
  options: { userId: userOptions },
  async run({ client, input }: Args<z.output<typeof sendDirectMessageInput>>) {
    return client.request('chat.postMessage', {
      channel: input.userId,
      text: input.text,
      username: input.username,
      icon_url: input.profilePicture,
      icon_emoji: input.iconEmoji,
      blocks: input.blocks,
      unfurl_links: input.unfurlLinks,
    });
  },
});

const sendChannelInput = z
  .object({
    channel,
    text: z.string().optional(),
    sendAsBot: z.boolean().default(true),
    threadTimestamp: timestamp.optional(),
    username: z.string().optional(),
    profilePicture: z.url().optional(),
    iconEmoji: z.string().optional(),
    file: slackFile.optional(),
    replyBroadcast: z.boolean().default(false),
    unfurlLinks: z.boolean().default(true),
    blocks,
  })
  .refine(({ text, blocks: value }) => Boolean(text) || value.length > 0, {
    message: 'A message or Block Kit blocks are required.',
  });

export const sendChannelMessage = action({
  slug: 'sendChannelMessage',
  description: 'Send a message and optional file to a Slack channel.',
  input: sendChannelInput,
  output: slackResponse,
  idempotent: false,
  options: { channel: channelOptions },
  async run({ client, input, req }: Args<z.output<typeof sendChannelInput>>) {
    const token = input.sendAsBot ? 'bot' : 'user';

    if (input.file) {
      const file = await loadSlackFile(req, input.file);

      return upload({
        client,
        file,
        channelId: input.channel,
        initialComment: input.text,
        threadTimestamp: input.threadTimestamp
          ? normalizeTimestamp(input.threadTimestamp)
          : undefined,
        token,
        signal: req.signal,
      });
    }

    return client.request(
      'chat.postMessage',
      {
        channel: input.channel,
        text: input.text,
        thread_ts: input.threadTimestamp ? normalizeTimestamp(input.threadTimestamp) : undefined,
        username: input.username,
        icon_url: input.profilePicture,
        icon_emoji: input.iconEmoji,
        reply_broadcast: input.replyBroadcast,
        unfurl_links: input.unfurlLinks,
        blocks: input.blocks,
      },
      token,
    );
  },
});

const addReactionInput = z.object({
  channel,
  timestamp,
  reaction: z.string().min(1),
  reactAsUser: z.boolean().default(false),
});

export const addReaction = action({
  slug: 'addReaction',
  description: 'Add an emoji reaction to a message.',
  input: addReactionInput,
  output: slackResponse,
  idempotent: true,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof addReactionInput>>) {
    return client.request(
      'reactions.add',
      {
        channel: input.channel,
        timestamp: normalizeTimestamp(input.timestamp),
        name: input.reaction,
      },
      input.reactAsUser ? 'user' : 'bot',
    );
  },
});

const uploadFileInput = z.object({
  file: slackFile,
  title: z.string().optional(),
  filename: z.string().optional(),
  channel: channel.optional(),
});

export const uploadFile = action({
  slug: 'uploadFile',
  description: 'Upload a file, optionally sharing it to a channel.',
  input: uploadFileInput,
  output: slackResponse,
  idempotent: false,
  options: { channel: channelOptions },
  async run({ client, input, req }: Args<z.output<typeof uploadFileInput>>) {
    const loaded = await loadSlackFile(req, {
      ...input.file,
      name: input.filename ?? input.file.name,
    });

    return upload({
      client,
      file: loaded,
      channelId: input.channel,
      title: input.title,
      signal: req.signal,
    });
  },
});

const getFileInput = z.object({ fileId: z.string().min(1) });

export const getFile = action({
  slug: 'getFile',
  description: 'Get Slack file metadata and safely download its contents.',
  input: getFileInput,
  output: slackValue,
  idempotent: true,
  async run({ client, input, req }: Args<z.output<typeof getFileInput>>) {
    const response = await client.request('files.info', { file: input.fileId });
    const file = response.file;

    if (
      !file ||
      typeof file !== 'object' ||
      !('url_private_download' in file) ||
      typeof file.url_private_download !== 'string'
    ) {
      throw new Error('Slack file has no download URL.');
    }

    const url = new URL(file.url_private_download);

    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'files.slack.com' ||
      url.username ||
      url.password
    ) {
      throw new Error('Slack file download URL is untrusted.');
    }

    const downloaded = await fetch(url, {
      headers: { authorization: `Bearer ${client.token()}` },
      redirect: 'error',
      signal: req.signal,
    });

    if (!downloaded.ok) throw new Error(`Slack file download failed (${downloaded.status}).`);

    const data = Buffer.from(await downloaded.arrayBuffer());
    const name =
      'name' in file && typeof file.name === 'string' ? file.name : `slack-${input.fileId}`;
    const mimeType =
      downloaded.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    const collection = req.frogbot.config.files?.slug;

    if (!collection) {
      throw new Error('[frogbot] Slack file downloads require the files collection.');
    }

    req.signal?.throwIfAborted();

    const saved = await req.frogbot.create({
      collection,
      data: {},
      file: { data, name, mimetype: mimeType, size: data.length },
      req,
      overrideAccess: false,
    });

    return {
      ...file,
      data: {
        id: saved.id,
        name,
        mimeType,
        size: data.length,
        url: typeof saved.url === 'string' ? saved.url : undefined,
      },
    };
  },
});

const searchMessagesInput = z.object({ query: z.string().min(1) });

export const searchMessages = action({
  slug: 'searchMessages',
  description: 'Search all Slack messages matching a query.',
  input: searchMessagesInput,
  output: slackValues,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof searchMessagesInput>>) {
    const matches: Record<string, unknown>[] = [];
    let cursor: string | undefined = '*';

    do {
      const response = await client.request(
        'search.messages',
        { query: input.query, count: 100, cursor },
        'user',
      );
      const messages = response.messages;

      if (!messages || typeof messages !== 'object') break;

      if ('matches' in messages && Array.isArray(messages.matches)) {
        for (const match of messages.matches) {
          if (match && typeof match === 'object' && !Array.isArray(match)) {
            matches.push(Object.fromEntries(Object.entries(match)));
          }
        }
      }

      const pagination = 'pagination' in messages ? messages.pagination : undefined;
      cursor =
        pagination && typeof pagination === 'object' && 'next_cursor' in pagination
          ? String(pagination.next_cursor || '') || undefined
          : undefined;
    } while (cursor);

    return matches;
  },
});

const emailInput = z.object({ email: z.email() });

export const findUserByEmail = action({
  slug: 'findUserByEmail',
  description: 'Find a Slack user by exact email address.',
  input: emailInput,
  output: slackResponse,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof emailInput>>) {
    return client.request('users.lookupByEmail', input);
  },
});

const handleInput = z.object({ handle: z.string().min(1) });

export const findUserByHandle = action({
  slug: 'findUserByHandle',
  description: 'Find a Slack user by display-name handle.',
  input: handleInput,
  output: slackValue,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof handleInput>>) {
    const handle = input.handle.replace(/^@/, '');
    const members = await client.paginate({
      path: 'users.list',
      item: 'members',
      body: { limit: 1000 },
    });
    const found = members.find((member) => {
      if (!member || typeof member !== 'object' || !('profile' in member)) return false;

      const profile = member.profile;

      return (
        profile &&
        typeof profile === 'object' &&
        'display_name' in profile &&
        profile.display_name === handle
      );
    });

    if (!found || typeof found !== 'object') {
      throw new Error(`Could not find user with handle @${handle}`);
    }

    return found;
  },
});

const findUserByIdInput = z.object({ id: z.string().min(1) });

export const findUserById = action({
  slug: 'findUserById',
  description: 'Find a Slack user profile by ID.',
  input: findUserByIdInput,
  output: slackResponse,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof findUserByIdInput>>) {
    return client.request('users.profile.get', { user: input.id });
  },
});

const listUsersInput = z.object({
  includeBots: z.boolean().default(false),
  includeDisabled: z.boolean().default(false),
});

export const listUsers = action({
  slug: 'listUsers',
  description: 'List all users in the workspace.',
  input: listUsersInput,
  output: slackValues,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof listUsersInput>>) {
    const members = await client.paginate({
      path: 'users.list',
      item: 'members',
      body: { limit: 1000 },
    });

    return members.filter((member) => {
      if (!member || typeof member !== 'object') return false;
      if (!input.includeBots && 'is_bot' in member && member.is_bot === true) return false;
      if (!input.includeDisabled && 'deleted' in member && member.deleted === true) return false;

      return true;
    });
  },
});

const updateMessageInput = z.object({ channel, timestamp, text: z.string().min(1), blocks });

export const updateMessage = action({
  slug: 'updateMessage',
  description: 'Update an existing Slack message.',
  input: updateMessageInput,
  output: slackResponse,
  idempotent: true,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof updateMessageInput>>) {
    return client.request('chat.update', {
      channel: input.channel,
      ts: normalizeTimestamp(input.timestamp),
      text: input.text,
      blocks: input.blocks,
    });
  },
});

const deleteMessageInput = z.object({ channel, timestamp });

export const deleteMessage = action({
  slug: 'deleteMessage',
  description: 'Delete a Slack message after confirming it exists.',
  input: deleteMessageInput,
  output: slackResponse,
  idempotent: false,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof deleteMessageInput>>) {
    const ts = normalizeTimestamp(input.timestamp);
    const history = await client.request(
      'conversations.history',
      { channel: input.channel, oldest: ts, limit: 1, inclusive: true },
      'user',
    );

    if (!Array.isArray(history.messages) || history.messages.length === 0) {
      throw new Error('No message found for the provided timestamp.');
    }

    return client.request('chat.delete', { channel: input.channel, ts }, 'user');
  },
});

const createChannelInput = z.object({
  channelName: z.string().min(1),
  isPrivate: z.boolean().default(false),
});

export const createChannel = action({
  slug: 'createChannel',
  description: 'Create a public or private Slack channel.',
  input: createChannelInput,
  output: slackResponse,
  idempotent: false,
  async run({ client, input }: Args<z.output<typeof createChannelInput>>) {
    return client.request('conversations.create', {
      name: input.channelName,
      is_private: input.isPrivate,
    });
  },
});

const updateProfileInput = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.email().optional(),
  userId: z.string().optional(),
});

export const updateProfile = action({
  slug: 'updateProfile',
  description: 'Update a Slack user profile.',
  input: updateProfileInput,
  output: slackResponse,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof updateProfileInput>>) {
    return client.request(
      'users.profile.set',
      {
        profile: { first_name: input.firstName, last_name: input.lastName, email: input.email },
        user: input.userId,
      },
      'user',
    );
  },
});

const getChannelHistoryInput = z.object({
  channel,
  oldest: z.number().optional(),
  latest: z.number().optional(),
  inclusive: z.boolean().default(false),
  includeAllMetadata: z.boolean().default(false),
});

export const getChannelHistory = action({
  slug: 'getChannelHistory',
  description: 'Get all messages in a channel between optional timestamps.',
  input: getChannelHistoryInput,
  output: slackValues,
  idempotent: true,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof getChannelHistoryInput>>) {
    return client.paginate({
      path: 'conversations.history',
      item: 'messages',
      body: {
        channel: input.channel,
        oldest: input.oldest,
        latest: input.latest,
        inclusive: input.inclusive,
        include_all_metadata: input.includeAllMetadata,
        limit: 200,
      },
    });
  },
});

const setUserStatusInput = z.object({
  text: z.string().max(100),
  emoji: z.string().optional(),
  expiration: z.number().int().optional(),
});

export const setUserStatus = action({
  slug: 'setUserStatus',
  description: 'Set the authenticated user custom status.',
  input: setUserStatusInput,
  output: slackResponse,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof setUserStatusInput>>) {
    return client.request(
      'users.profile.set',
      {
        profile: {
          status_text: input.text,
          status_emoji: input.emoji,
          status_expiration: input.expiration,
        },
      },
      'user',
    );
  },
});

const markdownToSlackInput = z.object({ markdown: z.string() });
const markdownToSlackOutput = z.object({ text: z.string() });

export const markdownToSlack = action({
  slug: 'markdownToSlack',
  description: 'Convert Markdown text to Slack mrkdwn.',
  input: markdownToSlackInput,
  output: markdownToSlackOutput,
  idempotent: true,
  async run({ input }: Args<z.output<typeof markdownToSlackInput>>) {
    const text = input.markdown
      .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '<$2|$1>')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/^[-+] /gm, '• ');

    return { text };
  },
});

const listThreadMessagesInput = z.object({ channel, threadTimestamp: timestamp });

export const listThreadMessages = action({
  slug: 'listThreadMessages',
  description: 'Retrieve all messages in a Slack thread.',
  input: listThreadMessagesInput,
  output: slackValues,
  idempotent: true,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof listThreadMessagesInput>>) {
    return client.paginate({
      path: 'conversations.replies',
      item: 'messages',
      body: { channel: input.channel, ts: normalizeTimestamp(input.threadTimestamp) },
    });
  },
});

const setChannelTopicInput = z.object({ channel, topic: z.string() });

export const setChannelTopic = action({
  slug: 'setChannelTopic',
  description: 'Set a Slack channel topic.',
  input: setChannelTopicInput,
  output: slackResponse,
  idempotent: true,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof setChannelTopicInput>>) {
    return client.request('conversations.setTopic', input);
  },
});

const getMessageInput = z.object({ channel, timestamp });

export const getMessage = action({
  slug: 'getMessage',
  description: 'Get a Slack message by channel and timestamp.',
  input: getMessageInput,
  output: slackResponse,
  idempotent: true,
  options: { channel: channelOptions },
  async run({ client, input }: Args<z.output<typeof getMessageInput>>) {
    return client.request('conversations.history', {
      channel: input.channel,
      oldest: normalizeTimestamp(input.timestamp),
      limit: 1,
      inclusive: true,
    });
  },
});

const inviteUserToChannelInput = z.object({ channel, userId: user });

export const inviteUserToChannel = action({
  slug: 'inviteUserToChannel',
  description: 'Invite an existing user to a Slack channel.',
  input: inviteUserToChannelInput,
  output: slackResponse,
  idempotent: false,
  options: { channel: channelOptions, userId: userOptions },
  async run({ client, input }: Args<z.output<typeof inviteUserToChannelInput>>) {
    return client.request('conversations.invite', { channel: input.channel, users: input.userId });
  },
});

export const getUserGroupByHandle = action({
  slug: 'getUserGroupByHandle',
  description: 'Get a Slack user group by handle.',
  input: handleInput,
  output: slackValue,
  idempotent: true,
  async run({ client, input }: Args<z.output<typeof handleInput>>) {
    return findUserGroup(client, input.handle);
  },
});

async function findUserGroup(client: SlackClient, value: string) {
  const handle = value.replace(/^@/, '').toLowerCase();
  const response = await client.request('usergroups.list');
  const groups = Array.isArray(response.usergroups) ? response.usergroups : [];
  const found = groups.find(
    (group) =>
      group &&
      typeof group === 'object' &&
      'handle' in group &&
      String(group.handle).toLowerCase() === handle,
  );

  if (!found || typeof found !== 'object') {
    throw new Error(`User group with handle '@${handle}' not found.`);
  }

  return found;
}

const updateUserGroupMembersInput = handleInput.extend({
  userIds: z.array(z.string()).optional(),
  appendUsers: z.boolean().default(true),
});

export const updateUserGroupMembers = action({
  slug: 'updateUserGroupMembers',
  description: 'Replace or append members in a Slack user group.',
  input: updateUserGroupMembersInput,
  output: slackResponse,
  idempotent: false,
  async run({ client, input }: Args<z.output<typeof updateUserGroupMembersInput>>) {
    const group = await findUserGroup(client, input.handle);
    const id = 'id' in group ? String(group.id) : '';
    const existing =
      input.appendUsers && 'users' in group && Array.isArray(group.users)
        ? group.users.map(String)
        : [];
    const users = [...new Set([...existing, ...(input.userIds ?? []).filter(Boolean)])].join(', ');

    return client.request('usergroups.users.update', { usergroup: id, users }, 'user');
  },
});

const customApiInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/),
  headers: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.record(z.string(), z.unknown()).optional(),
  useUserToken: z.boolean().default(false),
});

export const customApiCall = action({
  slug: 'customApiCall',
  description: 'Call one relative Slack Web API method.',
  input: customApiInput,
  output: slackApiResult,
  idempotent: false,
  async run({ client, input }: Args<z.output<typeof customApiInput>>) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(input.queryParams)) query.set(key, String(value));

    const suffix = query.size ? `?${query}` : '';
    const headers = new Headers(input.headers);

    headers.delete('authorization');
    headers.delete('cookie');
    headers.delete('host');

    if (input.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }

    return client.raw({
      path: `${input.path}${suffix}`,
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      token: input.useUserToken ? 'user' : 'bot',
    });
  },
});

export const slackActions = [
  addReaction,
  sendDirectMessage,
  sendChannelMessage,
  uploadFile,
  getFile,
  searchMessages,
  findUserByEmail,
  findUserByHandle,
  findUserById,
  listUsers,
  updateMessage,
  deleteMessage,
  createChannel,
  updateProfile,
  getChannelHistory,
  setUserStatus,
  markdownToSlack,
  listThreadMessages,
  setChannelTopic,
  getMessage,
  inviteUserToChannel,
  getUserGroupByHandle,
  updateUserGroupMembers,
  customApiCall,
];

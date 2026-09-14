import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { MicrosoftTeamsClient } from './client.js';
import { signal } from './client.js';
import { contentType, identifier, meetingIdentifierType } from './config.js';
import { channels, chats, members, teams } from './options.js';
import {
  channel,
  chat,
  member,
  message,
  page,
  recording,
  searchResult,
  transcript,
  user,
} from './schemas.js';

type Run<T extends z.ZodType> = PieceRunArgs<z.output<T>, object, MicrosoftTeamsClient>;

const teamInput = { teamId: identifier.meta({ label: 'Team' }) };
const channelInput = { ...teamInput, channelId: identifier.meta({ label: 'Channel' }) };
const chatInput = { chatId: identifier.meta({ label: 'Chat' }) };
const bodyInput = {
  contentType: contentType.meta({ label: 'Content type' }),
  content: z.string().min(1).meta({ label: 'Message' }),
};
const channelOptions = { teamId: teams, channelId: channels };
const chatOptions = { chatId: chats };

const createChannelInput = z.object({
  ...teamInput,
  channelDisplayName: z.string().trim().min(1).meta({ label: 'Channel name' }),
  channelDescription: z.string().optional().meta({ label: 'Channel description' }),
});

export const createChannel = {
  slug: 'createChannel',
  description: 'Create a standard channel in a team.',
  input: createChannelInput,
  output: channel,
  options: { teamId: teams },
  idempotent: false,
  async run({ client, input, req }: Run<typeof createChannelInput>) {
    return client.request(`/v1.0/teams/${encodeURIComponent(input.teamId)}/channels`, channel, {
      method: 'POST',
      body: { displayName: input.channelDisplayName, description: input.channelDescription },
      signal: signal(req),
    });
  },
};

export const createPrivateChannel = {
  ...createChannel,
  slug: 'createPrivateChannel',
  description: 'Create a private channel in a team.',
  async run({ client, input, req }: Run<typeof createChannelInput>) {
    return client.request(`/v1.0/teams/${encodeURIComponent(input.teamId)}/channels`, channel, {
      method: 'POST',
      body: {
        displayName: input.channelDisplayName,
        description: input.channelDescription,
        membershipType: 'private',
      },
      signal: signal(req),
    });
  },
};

const sendChannelMessageInput = z.object({ ...channelInput, ...bodyInput });

export const sendChannelMessage = {
  slug: 'sendChannelMessage',
  description: 'Send a top-level message to a channel.',
  input: sendChannelMessageInput,
  output: message,
  options: channelOptions,
  idempotent: false,
  async run({ client, input, req }: Run<typeof sendChannelMessageInput>) {
    return client.request(
      `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages`,
      message,
      {
        method: 'POST',
        body: { body: { content: input.content, contentType: input.contentType } },
        signal: signal(req),
      },
    );
  },
};

const sendChatMessageInput = z.object({ ...chatInput, ...bodyInput });

export const sendChatMessage = {
  slug: 'sendChatMessage',
  description: 'Send a message to an existing chat.',
  input: sendChatMessageInput,
  output: message,
  options: chatOptions,
  idempotent: false,
  async run({ client, input, req }: Run<typeof sendChatMessageInput>) {
    return client.request(`/v1.0/chats/${encodeURIComponent(input.chatId)}/messages`, message, {
      method: 'POST',
      body: { body: { content: input.content, contentType: input.contentType } },
      signal: signal(req),
    });
  },
};

const replyInput = z.object({ ...channelInput, messageId: identifier, ...bodyInput });

export const replyToChannelMessage = {
  slug: 'replyToChannelMessage',
  description: 'Reply to an existing channel message.',
  input: replyInput,
  output: message,
  options: channelOptions,
  idempotent: false,
  async run({ client, input, req }: Run<typeof replyInput>) {
    const path = `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}/replies`;

    return client.request(path, message, {
      method: 'POST',
      body: { body: { content: input.content, contentType: input.contentType } },
      signal: signal(req),
    });
  },
};

const createChatInput = z.object({
  ...teamInput,
  members: z.array(identifier).min(1).meta({ label: 'Members' }),
  ...bodyInput,
});
const createChatOutput = z.object({ chat, message });

export const createChatAndSendMessage = {
  slug: 'createChatAndSendMessage',
  description: 'Create a chat and send its first message.',
  input: createChatInput,
  output: createChatOutput,
  options: { teamId: teams, members },
  idempotent: false,
  async run({ client, input, req }: Run<typeof createChatInput>) {
    const current = await client.request('/v1.0/me', user, { signal: signal(req) });
    const bindings = [current.id, ...input.members].map((id) => ({
      '@odata.type': '#microsoft.graph.aadUserConversationMember',
      roles: ['owner'],
      'user@odata.bind': `${client.baseUrl}/v1.0/users('${encodeURIComponent(id)}')`,
    }));
    const created = await client.request('/v1.0/chats', chat, {
      method: 'POST',
      body: { chatType: input.members.length === 1 ? 'oneOnOne' : 'group', members: bindings },
      signal: signal(req),
    });
    const sent = await client.request(
      `/v1.0/chats/${encodeURIComponent(created.id)}/messages`,
      message,
      {
        method: 'POST',
        body: { body: { content: input.content, contentType: input.contentType } },
        signal: signal(req),
      },
    );

    return { chat: created, message: sent };
  },
};

const getChatMessageInput = z.object({ ...chatInput, messageId: identifier });

export const getChatMessage = {
  slug: 'getChatMessage',
  description: 'Get one message from a chat.',
  input: getChatMessageInput,
  output: message,
  options: chatOptions,
  idempotent: true,
  async run({ client, input, req }: Run<typeof getChatMessageInput>) {
    return client.request(
      `/v1.0/chats/${encodeURIComponent(input.chatId)}/messages/${encodeURIComponent(input.messageId)}`,
      message,
      { signal: signal(req) },
    );
  },
};

const deleteChatMessageOutput = z.object({
  success: z.literal(true),
  messageId: z.string(),
  chatId: z.string(),
});

export const deleteChatMessage = {
  slug: 'deleteChatMessage',
  description: 'Soft-delete a chat message sent by the current user.',
  input: getChatMessageInput,
  output: deleteChatMessageOutput,
  options: chatOptions,
  idempotent: true,
  async run({ client, input, req }: Run<typeof getChatMessageInput>) {
    const current = await client.request('/v1.0/me', user, { signal: signal(req) });
    const path = `/v1.0/users/${encodeURIComponent(current.id)}/chats/${encodeURIComponent(input.chatId)}/messages/${encodeURIComponent(input.messageId)}/softDelete`;

    await client.request(path, z.object({}), { method: 'POST', body: {}, signal: signal(req) });

    return { success: true, messageId: input.messageId, chatId: input.chatId };
  },
};

const getChannelMessageInput = z.object({
  ...channelInput,
  messageId: identifier,
  replyId: identifier.optional(),
});

export const getChannelMessage = {
  slug: 'getChannelMessage',
  description: 'Get a channel message or one of its replies.',
  input: getChannelMessageInput,
  output: message,
  options: channelOptions,
  idempotent: true,
  async run({ client, input, req }: Run<typeof getChannelMessageInput>) {
    const root = `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}`;
    const path = input.replyId ? `${root}/replies/${encodeURIComponent(input.replyId)}` : root;

    return client.request(path, message, { signal: signal(req) });
  },
};

const findChannelInput = z.object({ ...teamInput, channelName: z.string().trim().min(1) });

export const findChannel = {
  slug: 'findChannel',
  description: 'Find channels by exact display name.',
  input: findChannelInput,
  output: searchResult(channel),
  options: { teamId: teams },
  idempotent: true,
  async run({ client, input, req }: Run<typeof findChannelInput>) {
    const escaped = input.channelName.replaceAll("'", "''");
    const result = await client.request(
      `/v1.0/teams/${encodeURIComponent(input.teamId)}/allChannels`,
      page(channel),
      { query: { $filter: `displayName eq '${escaped}'` }, signal: signal(req) },
    );

    return { found: result.value.length > 0, result: result.value };
  },
};

const findMemberInput = z.object({
  ...teamInput,
  searchBy: z.enum(['email', 'name']).default('email'),
  searchValue: z.string().trim().min(1),
});

export const findTeamMember = {
  slug: 'findTeamMember',
  description: 'Find team members by exact email or display name.',
  input: findMemberInput,
  output: searchResult(member),
  options: { teamId: teams },
  idempotent: true,
  async run({ client, input, req }: Run<typeof findMemberInput>) {
    const escaped = input.searchValue.replaceAll("'", "''");
    const field = input.searchBy === 'email' ? 'email' : 'displayName';
    const result = await client.request(
      `/v1.0/teams/${encodeURIComponent(input.teamId)}/members`,
      page(member),
      {
        query: { $filter: `microsoft.graph.aadUserConversationMember/${field} eq '${escaped}'` },
        signal: signal(req),
      },
    );

    return { found: result.value.length > 0, result: result.value };
  },
};

const meetingInput = {
  meetingIdentifierType,
  meetingIdentifierValue: identifier,
};
const transcriptInput = z.object({ ...meetingInput, transcriptId: identifier.optional() });
const transcriptOutput = z.union([z.object({ content: z.string() }), page(transcript)]);

export const getMeetingTranscript = {
  slug: 'getMeetingTranscript',
  description: 'List meeting transcripts or retrieve VTT transcript text.',
  input: transcriptInput,
  output: transcriptOutput,
  idempotent: true,
  async run({ client, input, req }: Run<typeof transcriptInput>) {
    const meetingId = await client.meetingId(
      input.meetingIdentifierType,
      input.meetingIdentifierValue,
      signal(req),
    );
    const root = `/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`;

    if (!input.transcriptId) return client.request(root, page(transcript), { signal: signal(req) });

    const content = await client.text(`${root}/${encodeURIComponent(input.transcriptId)}/content`, {
      headers: { accept: 'text/vtt' },
      signal: signal(req),
    });

    return { content };
  },
};

const recordingInput = z.object({ ...meetingInput, recordingId: identifier.optional() });
const recordingOutput = z.union([recording, page(recording)]);

export const getMeetingRecording = {
  slug: 'getMeetingRecording',
  description: 'List meeting recordings or retrieve recording metadata.',
  input: recordingInput,
  output: recordingOutput,
  idempotent: true,
  async run({ client, input, req }: Run<typeof recordingInput>) {
    const meetingId = await client.meetingId(
      input.meetingIdentifierType,
      input.meetingIdentifierValue,
      signal(req),
    );
    const root = `/v1.0/me/onlineMeetings/${encodeURIComponent(meetingId)}/recordings`;

    return input.recordingId
      ? client.request(`${root}/${encodeURIComponent(input.recordingId)}`, recording, {
          signal: signal(req),
        })
      : client.request(root, page(recording), { signal: signal(req) });
  },
};

const customInput = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().min(1),
  query: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  body: z.json().optional(),
});
const customOutput = z.object({ status: z.number().int(), body: z.json() });

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make an authenticated JSON request within Microsoft Graph v1.0.',
  input: customInput,
  output: customOutput,
  idempotent: false,
  async run({ client, input, req }: Run<typeof customInput>) {
    const target = new URL(input.path, `${client.baseUrl}/v1.0/`);

    if (target.origin !== client.baseUrl || !target.pathname.startsWith('/v1.0/')) {
      throw new Error('Custom API calls must target Microsoft Graph v1.0 in the configured cloud.');
    }

    return client.custom(target.toString(), z.json(), {
      method: input.method,
      query: input.query,
      body: input.body,
      signal: signal(req),
    });
  },
};

export const microsoftTeamsActionDefinitions = [
  createChannel,
  sendChannelMessage,
  sendChatMessage,
  replyToChannelMessage,
  createChatAndSendMessage,
  createPrivateChannel,
  getChatMessage,
  deleteChatMessage,
  getChannelMessage,
  findChannel,
  findTeamMember,
  getMeetingTranscript,
  getMeetingRecording,
  customApiCall,
];

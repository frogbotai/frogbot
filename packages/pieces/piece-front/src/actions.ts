import type { FrogbotRequest } from 'frogbot';
import type { PieceActionDefinition, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { FrontClient, FrontResponse } from './client.js';

const objectOutput = z.record(z.string(), z.unknown());
const listOutput = z.array(objectOutput);
const successOutput = z.object({ success: z.literal(true), message: z.string() });
const id = (label: string) => z.string().min(1).meta({ label });
const handleSource = z.enum([
  'email',
  'phone',
  'twitter',
  'facebook',
  'intercom',
  'front_chat',
  'custom',
]);
const fileReference = z.object({
  fileId: z.union([z.string().min(1), z.number()]),
  name: z.string().min(1).optional(),
});

type ActionInput = Record<string, unknown>;
type MessageInput = ActionInput & {
  attachments?: z.output<typeof fileReference>[];
};

function action<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: PieceActionDefinition<TInput, TOutput, object, FrontClient>,
) {
  return definition;
}

function compact(input: ActionInput, omitted: string[] = []) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => !omitted.includes(key) && value !== undefined && value !== '',
    ),
  );
}

function isRecord(value: unknown): value is ActionInput {
  return objectOutput.safeParse(value).success;
}

function success(message: string) {
  return { success: true as const, message };
}

function query(values: ActionInput) {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });

  const encoded = params.toString();

  return encoded ? `?${encoded}` : '';
}

async function loadAttachments(req: FrogbotRequest, attachments: z.output<typeof fileReference>[]) {
  const collection = req.frogbot.config?.files?.slug;
  if (!collection) throw new Error('[frogbot] Front attachments require the files collection.');

  return Promise.all(
    attachments.map(async (attachment) => {
      const doc = await req.frogbot.findByID({
        collection,
        id: attachment.fileId,
        depth: 0,
        req,
        overrideAccess: false,
      });
      if (typeof doc.url !== 'string') {
        throw new Error('[frogbot] Front attachment is unavailable.');
      }

      const config = await req.frogbot.config._internal.payloadConfig;
      const origin = new URL(config.serverURL || req.url || '');
      const url = new URL(doc.url, origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('[frogbot] Front attachment URL is invalid.');
      }

      const headers = new Headers();
      if (url.origin === origin.origin) {
        for (const name of ['authorization', 'cookie']) {
          const value = req.headers.get(name);
          if (value) headers.set(name, value);
        }
      }

      const response = await fetch(url, { headers, redirect: 'error', signal: req.signal });
      if (!response.ok) {
        throw new Error(`[frogbot] Front attachment is unavailable (${response.status}).`);
      }

      return {
        blob: await response.blob(),
        name:
          attachment.name ??
          (typeof doc.filename === 'string' ? doc.filename : `attachment-${attachment.fileId}`),
      };
    }),
  );
}

async function sendMessageBody({
  client,
  method = 'POST',
  path,
  input,
  req,
}: PieceRunArgs<MessageInput, object, FrontClient> & { method?: string; path: string }) {
  const attachments = input.attachments ?? [];
  const fields = compact(input, [
    'attachments',
    'conversationId',
    'channelId',
    'authorId',
    'signatureId',
    'shouldAddDefaultSignature',
    'tagIds',
  ]);

  if (attachments.length === 0) return client.request(method, path, fields);

  const files = await loadAttachments(req, attachments);
  const form = new FormData();

  const append = (name: string, value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => append(`${name}[${index}]`, entry));
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => append(`${name}[${key}]`, entry));
    } else if (value !== undefined && value !== '') {
      form.append(name, String(value));
    }
  };

  Object.entries(fields).forEach(([name, value]) => append(name, value));
  files.forEach(({ blob, name }, index) => form.append(`attachments[${index}]`, blob, name));

  return client.request(method, path, form);
}

const conversations = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/conversations'), 'subject');
const contacts = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/contacts?limit=50'), 'name');
const tags = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/tags?limit=50'), 'name');
const teammates = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/teammates?limit=50'), 'username');
const channels = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/channels'), 'name');
const accounts = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/accounts'), 'name');
const links = async ({ client }: { client: FrontClient }) =>
  choices(await client.request('GET', '/links'), 'name');

function choices(response: FrontResponse, labelKey: string) {
  const results = Array.isArray(response._results) ? response._results : [];

  return results.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || typeof entry.id !== 'string') {
      return [];
    }

    const label =
      labelKey in entry && typeof entry[labelKey] === 'string' ? entry[labelKey] : entry.id;

    return [{ label, value: entry.id }];
  });
}

const messageFields = {
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
  attachments: z.array(fileReference).optional(),
};

export const addComment = action({
  slug: 'addComment',
  description: 'Add an internal comment to a conversation.',
  input: z.object({ conversationId: id('Conversation'), authorId: id('Author'), body: z.string() }),
  output: objectOutput,
  idempotent: false,
  options: { conversationId: conversations, authorId: teammates },
  run: ({ client, input }) =>
    client.request('POST', `/conversations/${input.conversationId}/comments`, {
      body: input.body,
      author_id: input.authorId,
    }),
});

export const addContactHandle = action({
  slug: 'addContactHandle',
  description: 'Add a handle to a contact.',
  input: z.object({ contactId: id('Contact'), source: handleSource, handle: z.string().min(1) }),
  output: successOutput,
  idempotent: false,
  options: { contactId: contacts },
  async run({ client, input }) {
    await client.request('POST', `/contacts/${input.contactId}/handles`, {
      source: input.source,
      handle: input.handle,
    });
    return success(`Handle added to contact ${input.contactId}.`);
  },
});

function conversationCollectionAction(
  slug: string,
  resource: 'links' | 'tags',
  method: 'POST' | 'DELETE',
) {
  const key =
    resource === 'links' && method === 'DELETE'
      ? 'links'
      : resource === 'links'
        ? 'linkIds'
        : 'tagIds';
  const input = z.object({ conversationId: id('Conversation'), [key]: z.array(z.string()).min(1) });

  return action({
    slug,
    description: `${method === 'POST' ? 'Add' : 'Remove'} conversation ${resource}.`,
    input,
    output: method === 'POST' ? successOutput : objectOutput,
    idempotent: method === 'POST',
    options: {
      conversationId: conversations,
      ...(key === 'linkIds' ? { linkIds: links } : key === 'tagIds' ? { tagIds: tags } : {}),
    },
    async run({ client, input }) {
      const body = {
        [key === 'linkIds' ? 'link_ids' : key === 'tagIds' ? 'tag_ids' : key]: input[key],
      };
      const response = await client.request(
        method,
        `/conversations/${input.conversationId}/${resource}`,
        body,
      );
      return method === 'POST'
        ? success(`${resource} added to conversation ${input.conversationId}.`)
        : response;
    },
  });
}

export const addConversationLinks = conversationCollectionAction(
  'addConversationLinks',
  'links',
  'POST',
);
export const addConversationTags = conversationCollectionAction(
  'addConversationTags',
  'tags',
  'POST',
);
export const removeConversationLinks = conversationCollectionAction(
  'removeConversationLinks',
  'links',
  'DELETE',
);
export const removeConversationTags = conversationCollectionAction(
  'removeConversationTags',
  'tags',
  'DELETE',
);

export const assignConversation = action({
  slug: 'assignConversation',
  description: 'Assign or unassign a conversation.',
  input: z.object({ conversationId: id('Conversation'), assigneeId: id('Assignee').optional() }),
  output: successOutput,
  idempotent: true,
  options: { conversationId: conversations, assigneeId: teammates },
  async run({ client, input }) {
    await client.request(
      'PUT',
      `/conversations/${input.conversationId}/assignee`,
      input.assigneeId ? { assignee_id: input.assigneeId } : {},
    );
    return success(`Conversation ${input.conversationId} assignee changed.`);
  },
});

export const createAccount = action({
  slug: 'createAccount',
  description: 'Create a company account.',
  input: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    domains: z.array(z.string()).optional(),
    externalId: z.string().optional(),
    customFields: objectOutput.default({}),
  }),
  output: objectOutput,
  idempotent: false,
  run: ({ client, input }) =>
    client.request('POST', '/accounts', {
      ...compact(input, ['externalId', 'customFields']),
      external_id: input.externalId,
      custom_fields: input.customFields,
    }),
});

export const createContact = action({
  slug: 'createContact',
  description: 'Create a contact.',
  input: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    handles: z.array(z.object({ handle: z.string(), source: handleSource })).min(1),
    avatarUrl: z.string().url().optional(),
    links: z.array(z.string()).optional(),
    groupNames: z.array(z.string()).optional(),
    listNames: z.array(z.string()).optional(),
    customFields: objectOutput.default({}),
  }),
  output: objectOutput,
  idempotent: false,
  run: ({ client, input }) =>
    client.request('POST', '/contacts', {
      ...compact(input, ['avatarUrl', 'groupNames', 'listNames', 'customFields']),
      avatar_url: input.avatarUrl,
      group_names: input.groupNames,
      list_names: input.listNames,
      custom_fields: input.customFields,
    }),
});

export const createDraft = action({
  slug: 'createDraft',
  description: 'Create a draft for a new conversation.',
  input: z.object({
    channelId: id('Channel'),
    ...messageFields,
    to: z.array(z.string()).min(1),
    mode: z.enum(['private', 'shared']).default('private'),
    signatureId: z.string().optional(),
    shouldAddDefaultSignature: z.boolean().default(false),
  }),
  output: objectOutput,
  idempotent: false,
  options: { channelId: channels },
  run: (args) =>
    sendMessageBody({
      ...args,
      path: `/channels/${args.input.channelId}/drafts`,
      input: {
        ...args.input,
        channel_id: args.input.channelId,
        signature_id: args.input.signatureId,
        should_add_default_signature: args.input.shouldAddDefaultSignature,
      },
    }),
});

export const createDraftReply = action({
  slug: 'createDraftReply',
  description: 'Create a draft reply to a conversation.',
  input: z.object({
    conversationId: id('Conversation'),
    ...messageFields,
    authorId: id('Author').optional(),
    channelId: id('Channel').optional(),
    mode: z.enum(['private', 'shared']).default('private'),
    signatureId: z.string().optional(),
    shouldAddDefaultSignature: z.boolean().default(false),
  }),
  output: objectOutput,
  idempotent: false,
  options: { conversationId: conversations, authorId: teammates, channelId: channels },
  run: (args) =>
    sendMessageBody({
      ...args,
      path: `/conversations/${args.input.conversationId}/drafts`,
      input: {
        ...args.input,
        author_id: args.input.authorId,
        channel_id: args.input.channelId,
        signature_id: args.input.signatureId,
        should_add_default_signature: args.input.shouldAddDefaultSignature,
      },
    }),
});

export const createLink = action({
  slug: 'createLink',
  description: 'Create an external link.',
  input: z.object({
    name: z.string().min(1),
    externalUrl: z.string().url(),
    pattern: z.string().optional(),
  }),
  output: objectOutput,
  idempotent: false,
  run: ({ client, input }) =>
    client.request('POST', '/links', {
      name: input.name,
      external_url: input.externalUrl,
      pattern: input.pattern,
    }),
});

export const listAccounts = action({
  slug: 'listAccounts',
  description: 'List accounts with optional filters.',
  input: z.object({
    emailDomain: z.string().optional(),
    externalId: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    pageToken: z.string().optional(),
    sortBy: z.enum(['created_at', 'updated_at']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  output: listOutput,
  idempotent: true,
  async run({ client, input }) {
    const response = await client.request(
      'GET',
      `/accounts${query({ limit: input.limit, page_token: input.pageToken, sort_by: input.sortBy, sort_order: input.sortOrder })}`,
    );
    const results = Array.isArray(response._results) ? response._results : [];
    return results.filter((account) => {
      if (!isRecord(account)) return false;

      return (
        (!input.emailDomain || account.email_domain === input.emailDomain) &&
        (!input.externalId || account.external_id === input.externalId)
      );
    });
  },
});

export const searchContacts = action({
  slug: 'searchContacts',
  description: 'Search contacts.',
  input: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    query: z.string().optional(),
    limit: z.number().int().min(1).optional(),
    pageToken: z.string().optional(),
  }),
  output: objectOutput,
  idempotent: true,
  run: ({ client, input }) =>
    client.request(
      'GET',
      `/contacts${query({ 'q[types]': input.email, 'q[handles]': input.phone, q: input.query, limit: input.limit, page_token: input.pageToken })}`,
    ),
});

export const searchConversations = action({
  slug: 'searchConversations',
  description: 'Search conversations.',
  input: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).optional(),
    pageToken: z.string().optional(),
  }),
  output: objectOutput,
  idempotent: true,
  run: ({ client, input }) =>
    client.request(
      'GET',
      `/conversations/search${query({ q: input.query, limit: input.limit, page_token: input.pageToken })}`,
    ),
});

export const removeContactHandle = action({
  slug: 'removeContactHandle',
  description: 'Remove a handle from a contact.',
  input: z.object({
    contactId: id('Contact'),
    handle: z.string().min(1),
    source: handleSource,
    force: z.boolean().default(false),
  }),
  output: successOutput,
  idempotent: true,
  options: { contactId: contacts },
  async run({ client, input }) {
    await client.request('DELETE', `/contacts/${input.contactId}/handles`, {
      handle: input.handle,
      source: input.source,
      force: input.force,
    });
    return success(`Handle ${input.handle} removed from contact ${input.contactId}.`);
  },
});

export const sendMessage = action({
  slug: 'sendMessage',
  description: 'Send a message that starts a conversation.',
  input: z.object({
    channelId: id('Channel'),
    ...messageFields,
    to: z.array(z.string()).min(1),
    tagIds: z.array(z.string()).optional(),
  }),
  output: objectOutput,
  idempotent: false,
  options: { channelId: channels, tagIds: tags },
  run: (args) =>
    sendMessageBody({
      ...args,
      path: `/channels/${args.input.channelId}/messages`,
      input: { ...args.input, channel_id: args.input.channelId, tag_ids: args.input.tagIds },
    }),
});

export const sendReply = action({
  slug: 'sendReply',
  description: 'Send a reply to a conversation.',
  input: z.object({
    conversationId: id('Conversation'),
    ...messageFields,
    authorId: id('Author').optional(),
    channelId: id('Channel').optional(),
  }),
  output: objectOutput,
  idempotent: false,
  options: { conversationId: conversations, authorId: teammates, channelId: channels },
  run: (args) =>
    sendMessageBody({
      ...args,
      path: `/conversations/${args.input.conversationId}/messages`,
      input: { ...args.input, author_id: args.input.authorId, channel_id: args.input.channelId },
    }),
});

function updateAction<TInput extends z.ZodObject>(
  slug: string,
  resource: 'accounts' | 'contacts' | 'conversations' | 'links',
  schema: TInput,
  idKey: keyof z.output<TInput> & string,
  options: PieceActionDefinition<TInput, typeof objectOutput, object, FrontClient>['options'],
) {
  return action({
    slug,
    description: `Update a Front ${resource.slice(0, -1)}.`,
    input: schema,
    output: resource === 'accounts' ? objectOutput : successOutput,
    idempotent: true,
    options,
    async run({ client, input }) {
      const mapping: Record<string, string> = {
        avatarUrl: 'avatar_url',
        customFields: 'custom_fields',
        externalUrl: 'external_url',
        assigneeId: 'assignee_id',
        inboxId: 'inbox_id',
        tagIds: 'tag_ids',
      };
      const body = Object.fromEntries(
        Object.entries(compact(input, [idKey])).map(([key, value]) => [mapping[key] ?? key, value]),
      );
      const response = await client.request('PATCH', `/${resource}/${input[idKey]}`, body);
      return resource === 'accounts'
        ? response
        : success(`${resource.slice(0, -1)} ${input[idKey]} updated.`);
    },
  });
}

export const updateAccount = updateAction(
  'updateAccount',
  'accounts',
  z.object({
    accountId: id('Account'),
    name: z.string().optional(),
    description: z.string().optional(),
    domains: z.array(z.string()).optional(),
    customFields: objectOutput.optional(),
  }),
  'accountId',
  { accountId: accounts },
);
export const updateContact = updateAction(
  'updateContact',
  'contacts',
  z.object({
    contactId: id('Contact'),
    name: z.string().optional(),
    description: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    links: z.array(z.string()).optional(),
  }),
  'contactId',
  { contactId: contacts },
);
export const updateConversation = updateAction(
  'updateConversation',
  'conversations',
  z.object({
    conversationId: id('Conversation'),
    status: z.enum(['open', 'archived', 'deleted']).optional(),
    assigneeId: id('Assignee').optional(),
    inboxId: id('Inbox').optional(),
    tagIds: z.array(z.string()).optional(),
  }),
  'conversationId',
  { conversationId: conversations },
);
export const updateLink = updateAction(
  'updateLink',
  'links',
  z.object({
    linkId: id('Link'),
    name: z.string().optional(),
    externalUrl: z.string().url().optional(),
  }),
  'linkId',
  { linkId: links },
);

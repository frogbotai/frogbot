import { z } from 'zod';

import { zendeskBody } from '../body.js';
import { signal } from '../client.js';
import { zendeskId } from '../config.js';
import { defineAction } from '../define.js';
import { fileInput, loadFile } from '../files.js';
import { attachment, ticket } from '../records.js';

const ticketId = zendeskId('Ticket ID');
const optionalId = (label: string) => zendeskId(label).optional();
const emails = (description: string) => z.array(z.email()).optional().meta({ description });

const ticketFields = {
  subject: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  type: z.enum(['problem', 'incident', 'question', 'task']).optional(),
  status: z.enum(['new', 'open', 'pending', 'hold', 'solved', 'closed']).optional(),
  tags: z.array(z.string().min(1)).optional().meta({ description: 'Replaces the ticket’s tags.' }),
  assigneeEmail: z.email().optional().meta({ description: 'The agent to assign.' }),
  organizationId: optionalId('Organization ID'),
  groupId: optionalId('Group ID'),
  brandId: optionalId('Brand ID'),
  problemId: optionalId('Problem ticket ID').meta({
    description: 'For an incident, the problem ticket it belongs to.',
  }),
  externalId: z.string().optional(),
  dueAt: z.iso.datetime({ offset: true }).optional().meta({ description: 'For tasks only.' }),
  customFields: z
    .array(z.object({ id: z.number().int(), value: z.json() }))
    .optional()
    .meta({ description: 'Field ids from listTicketFields, with their values.' }),
  collaboratorEmails: emails('People to CC.'),
  followerEmails: emails('Agents to add as followers.'),
};

const commentFields = {
  commentBody: z.string().optional(),
  commentHtmlBody: z.string().optional().meta({ description: 'Used instead of commentBody.' }),
  commentPublic: z
    .boolean()
    .optional()
    .meta({ description: 'false for an internal note. Zendesk makes comments public by default.' }),
};

type TicketInput = Partial<
  z.output<z.ZodObject<typeof ticketFields>> & z.output<z.ZodObject<typeof commentFields>>
>;

function comment(input: TicketInput) {
  const text = input.commentHtmlBody
    ? { html_body: input.commentHtmlBody }
    : input.commentBody
      ? { body: input.commentBody }
      : undefined;

  return (
    text && {
      ...text,
      ...(input.commentPublic === undefined ? {} : { public: input.commentPublic }),
    }
  );
}

function ticketBody(input: TicketInput & Record<string, unknown>) {
  return {
    ...zendeskBody(input, [
      'ticketId',
      'commentBody',
      'commentHtmlBody',
      'commentPublic',
      'collaboratorEmails',
      'followerEmails',
      'requesterEmail',
      'requesterName',
      'safeUpdate',
      'updatedStamp',
    ]),
    ...(input.collaboratorEmails?.length ? { collaborators: input.collaboratorEmails } : {}),
    ...(input.followerEmails?.length
      ? { followers: input.followerEmails.map((email) => ({ user_email: email, action: 'put' })) }
      : {}),
    ...(comment(input) ? { comment: comment(input) } : {}),
  };
}

const ticketOutput = z.object({ ticket });

const safeUpdate = {
  updatedStamp: z.iso.datetime({ offset: true }).optional().meta({
    description:
      'The ticket’s updated_at as last read. When set, Zendesk refuses the change with a 409 if the ticket changed since.',
  }),
};

function safe(input: { updatedStamp?: string }) {
  return input.updatedStamp ? { safe_update: true, updated_stamp: input.updatedStamp } : {};
}

export const createTicket = defineAction({
  slug: 'createTicket',
  description:
    'Create a ticket with its first comment. A requester email Zendesk doesn’t know becomes a new end user.',
  input: z
    .object({
      ...ticketFields,
      ...commentFields,
      requesterEmail: z.email().optional(),
      requesterName: z
        .string()
        .optional()
        .meta({ description: 'Used when the requester is new; defaults to the email.' }),
    })
    .refine((input) => Boolean(input.commentBody || input.commentHtmlBody), {
      message: 'createTicket needs commentBody or commentHtmlBody.',
    }),
  output: ticketOutput,
  idempotent: false,
  async run({ client, input, req }) {
    const { ticket: created } = await client.data(ticketOutput, {
      method: 'POST',
      path: '/api/v2/tickets',
      body: {
        ticket: {
          ...ticketBody(input),
          ...(input.requesterEmail
            ? {
                requester: {
                  email: input.requesterEmail,
                  name: input.requesterName ?? input.requesterEmail,
                },
              }
            : {}),
        },
      },
      signal: signal(req),
    });

    return { ticket: created };
  },
});

export const updateTicket = defineAction({
  slug: 'updateTicket',
  description:
    'Update a ticket’s fields, and optionally add a comment. Only the fields given change; tags replace the existing ones.',
  input: z.object({
    ticketId,
    ...ticketFields,
    ...commentFields,
    requesterId: optionalId('Requester ID'),
    customStatusId: optionalId('Custom status ID'),
    ...safeUpdate,
  }),
  output: ticketOutput,
  idempotent: false,
  async run({ client, input, req }) {
    const { ticket: updated } = await client.data(ticketOutput, {
      method: 'PUT',
      path: `/api/v2/tickets/${input.ticketId}`,
      body: { ticket: { ...ticketBody(input), ...safe(input) } },
      signal: signal(req),
    });

    return { ticket: updated };
  },
});

const tagsInput = z.array(z.string().min(1)).min(1).meta({ label: 'Tags' });
const tagsOutput = z.object({ tags: z.array(z.string()) });

export const addTagToTicket = defineAction({
  slug: 'addTagToTicket',
  description:
    'Add tags to a ticket, keeping its others. Returns the ticket’s tags after the change.',
  input: z.object({ ticketId, tags: tagsInput, ...safeUpdate }),
  output: tagsOutput,
  idempotent: true,
  run: ({ client, input, req }) =>
    client.data(tagsOutput, {
      method: 'PUT',
      path: `/api/v2/tickets/${input.ticketId}/tags`,
      body: { tags: input.tags, ...safe(input) },
      signal: signal(req),
    }),
});

export const removeTagFromTicket = defineAction({
  slug: 'removeTagFromTicket',
  description: 'Remove tags from a ticket. Returns the ticket’s tags after the change.',
  input: z.object({ ticketId, tags: tagsInput }),
  output: tagsOutput,
  idempotent: true,
  run: ({ client, input, req }) =>
    client.data(tagsOutput, {
      method: 'DELETE',
      path: `/api/v2/tickets/${input.ticketId}/tags`,
      body: { tags: input.tags },
      signal: signal(req),
    }),
});

export const addCommentToTicket = defineAction({
  slug: 'addCommentToTicket',
  description:
    'Add a public reply, which Zendesk emails to the requester, or an internal note (public: false) to a ticket.',
  input: z
    .object({
      ticketId,
      body: z.string().optional(),
      htmlBody: z.string().optional().meta({ description: 'Used instead of body.' }),
      public: z.boolean().default(true).meta({ description: 'false for an internal note.' }),
      authorId: optionalId('Author ID').meta({
        description: 'Who the comment is from; defaults to the token’s user.',
      }),
      uploads: z
        .array(z.string().min(1))
        .optional()
        .meta({ description: 'Upload tokens to attach, from Zendesk’s /uploads.' }),
    })
    .refine((input) => Boolean(input.body || input.htmlBody), {
      message: 'addCommentToTicket needs body or htmlBody.',
    }),
  output: ticketOutput,
  idempotent: false,
  async run({ client, input, req }) {
    const { ticket: updated } = await client.data(ticketOutput, {
      method: 'PUT',
      path: `/api/v2/tickets/${input.ticketId}`,
      body: {
        ticket: {
          comment: {
            ...(input.htmlBody ? { html_body: input.htmlBody } : { body: input.body }),
            public: input.public,
            ...zendeskBody({ authorId: input.authorId, uploads: input.uploads }),
          },
        },
      },
      signal: signal(req),
    });

    return { ticket: updated };
  },
});

const uploadOutput = z.object({ upload: z.object({ token: z.string(), attachment }) });

export const attachFileToTicket = defineAction({
  slug: 'attachFileToTicket',
  description:
    'Upload a FrogBot file to Zendesk and attach it to a ticket on a new comment, public unless public is false.',
  input: z.object({
    ticketId,
    file: fileInput,
    body: z
      .string()
      .optional()
      .meta({ description: 'The comment text; defaults to "File attached: <name>".' }),
    public: z.boolean().optional(),
  }),
  output: z.object({ ticket, attachment, uploadToken: z.string() }),
  idempotent: false,
  async run({ client, input, req, overrideAccess }) {
    const file = await loadFile(req, input.file, overrideAccess);
    const { upload } = await client.data(uploadOutput, {
      method: 'POST',
      path: '/api/v2/uploads',
      query: { filename: file.name },
      body: new Uint8Array(file.data),
      contentType: file.mimeType,
      signal: signal(req),
    });

    const { ticket: updated } = await client.data(ticketOutput, {
      method: 'PUT',
      path: `/api/v2/tickets/${input.ticketId}`,
      body: {
        ticket: {
          comment: {
            body: input.body || `File attached: ${file.name}`,
            uploads: [upload.token],
            ...(input.public === undefined ? {} : { public: input.public }),
          },
        },
      },
      signal: signal(req),
    });

    return { ticket: updated, attachment: upload.attachment, uploadToken: upload.token };
  },
});

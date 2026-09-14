import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Trello } from './client.js';
import { loadAttachment } from './files.js';
import { boardOptions, labelOptions, listOptions } from './options.js';
import { attachmentOutput, cardOutput, emptyOutput } from './schemas.js';

type Args<T> = PieceRunArgs<T, Record<string, never>, Trello>;

const cardIdInput = z.object({ cardId: z.string().min(1).meta({ label: 'Card ID' }) });
const attachmentIdInput = cardIdInput.extend({
  attachmentId: z.string().min(1).meta({ label: 'Attachment ID' }),
});

export const createCard = {
  slug: 'createCard',
  description: 'Create a Trello card.',
  input: z.object({
    boardId: z.string().min(1).meta({ label: 'Board' }),
    listId: z.string().min(1).meta({ label: 'List' }),
    name: z.string().min(1).meta({ label: 'Task name' }),
    description: z.string().optional().meta({ label: 'Task description' }),
    position: z.enum(['top', 'bottom']).optional(),
    labelIds: z.array(z.string()).optional().meta({ label: 'Labels' }),
  }),
  output: cardOutput,
  idempotent: false,
  options: { boardId: boardOptions, listId: listOptions, labelIds: labelOptions },
  async run({
    client,
    input,
  }: Args<{
    boardId: string;
    description?: string;
    labelIds?: string[];
    listId: string;
    name: string;
    position?: 'bottom' | 'top';
  }>) {
    return client.request('cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        desc: input.description,
        pos: input.position,
        idLabels: input.labelIds,
      }),
      query: { idList: input.listId },
    });
  },
};

export const getCard = {
  slug: 'getCard',
  description: 'Get a Trello card by ID.',
  input: cardIdInput,
  output: cardOutput,
  idempotent: true,
  async run({ client, input }: Args<{ cardId: string }>) {
    return client.getCard(input.cardId);
  },
};

export const updateCard = {
  slug: 'updateCard',
  description: 'Update a Trello card.',
  input: z.object({
    cardId: z.string().min(1),
    boardId: z.string().optional(),
    listId: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    position: z.enum(['top', 'bottom']).optional(),
    labelIds: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    due: z.string().datetime().optional(),
  }),
  output: cardOutput,
  idempotent: true,
  options: { boardId: boardOptions, listId: listOptions, labelIds: labelOptions },
  async run({ client, input }: Args<Record<string, unknown> & { cardId: string }>) {
    return client.request(`cards/${input.cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        desc: input.description,
        idList: input.listId,
        pos: input.position,
        idLabels: input.labelIds,
        closed: input.archived,
        due: input.due,
      }),
    });
  },
};

export const deleteCard = {
  slug: 'deleteCard',
  description: 'Permanently delete a Trello card.',
  input: cardIdInput,
  output: emptyOutput,
  idempotent: false,
  async run({ client, input }: Args<{ cardId: string }>) {
    return client.request(`cards/${input.cardId}`, { method: 'DELETE' });
  },
};

export const listCardAttachments = {
  slug: 'listCardAttachments',
  description: 'List attachments on a Trello card.',
  input: cardIdInput,
  output: z.array(attachmentOutput),
  idempotent: true,
  async run({ client, input }: Args<{ cardId: string }>) {
    return client.request(`cards/${input.cardId}/attachments`);
  },
};

export const addCardAttachment = {
  slug: 'addCardAttachment',
  description: 'Upload an attachment to a Trello card.',
  input: cardIdInput.extend({
    attachment: z.object({
      fileId: z.union([z.string(), z.number()]),
      name: z.string().optional(),
    }),
    name: z.string().optional(),
    mimeType: z.string().optional(),
    setCover: z.boolean().optional(),
  }),
  output: attachmentOutput,
  idempotent: false,
  async run({
    client,
    input,
    req,
  }: Args<{
    attachment: { fileId: number | string; name?: string };
    cardId: string;
    mimeType?: string;
    name?: string;
    setCover?: boolean;
  }>) {
    const attachment = await loadAttachment(req, input.attachment);
    const form = new FormData();

    form.append('file', attachment.data, attachment.name);

    return client.request(`cards/${input.cardId}/attachments`, {
      method: 'POST',
      body: form,
      query: {
        mimeType: input.mimeType ?? attachment.type,
        name: input.name,
        setCover: input.setCover,
      },
    });
  },
};

export const getCardAttachment = {
  slug: 'getCardAttachment',
  description: 'Get one attachment from a Trello card.',
  input: attachmentIdInput,
  output: attachmentOutput,
  idempotent: true,
  async run({ client, input }: Args<{ attachmentId: string; cardId: string }>) {
    return client.request(`cards/${input.cardId}/attachments/${input.attachmentId}`);
  },
};

export const deleteCardAttachment = {
  slug: 'deleteCardAttachment',
  description: 'Permanently delete an attachment from a Trello card.',
  input: attachmentIdInput,
  output: emptyOutput,
  idempotent: false,
  async run({ client, input }: Args<{ attachmentId: string; cardId: string }>) {
    return client.request(`cards/${input.cardId}/attachments/${input.attachmentId}`, {
      method: 'DELETE',
    });
  },
};

const customInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/'),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.json().optional(),
});

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make an authenticated Trello API call.',
  input: customInput,
  output: z.json(),
  idempotent: false,
  async run({ client, input }: Args<z.output<typeof customInput>>) {
    return client.request(input.path, {
      method: input.method,
      headers: {
        ...input.headers,
        ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      query: input.query,
    });
  },
};

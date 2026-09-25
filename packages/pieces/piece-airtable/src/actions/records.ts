import type { FrogBotRequest } from 'frogbot';
import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { AirtableClient } from '../client.js';
import { defineAirtableAction } from '../definitions.js';
import {
  attachmentOptions,
  baseOptions,
  fieldOptions,
  tableOptions,
  viewOptions,
} from '../options.js';
import { commentSchema, fieldsSchema, recordSchema, selectionSchema } from '../schemas.js';

const recordInput = z.object({
  ...selectionSchema,
  fields: fieldsSchema.meta({ label: 'Fields' }),
});
const identifiedRecordInput = z.object({
  ...selectionSchema,
  recordId: z.string().min(1).meta({ label: 'Record ID' }),
});
const recordsOptions = { baseId: baseOptions, tableId: tableOptions };

function removeEmpty(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => {
      if (value === null || value === undefined || value === '') return false;

      return !Array.isArray(value) || value.length > 0;
    }),
  );
}

export const createRecord = defineAirtableAction({
  slug: 'createRecord',
  description: 'Create a record in a table.',
  input: recordInput,
  output: recordSchema,
  options: recordsOptions,
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof recordInput>, object, AirtableClient>) {
    return client.request({
      method: 'POST',
      path: `/${input.baseId}/${input.tableId}`,
      body: { fields: removeEmpty(input.fields), typecast: true },
      signal: req.signal ?? undefined,
    });
  },
});

const findRecordsInput = z.object({
  ...selectionSchema,
  searchField: z.string().min(1).meta({ label: 'Search field' }),
  searchValue: z.string().meta({ label: 'Search value' }),
  viewId: z.string().optional().meta({ label: 'View' }),
});

export const findRecords = defineAirtableAction({
  slug: 'findRecords',
  description: 'Find records containing a value in a selected field.',
  input: findRecordsInput,
  output: z.array(recordSchema),
  options: {
    ...recordsOptions,
    searchField: fieldOptions,
    viewId: viewOptions,
  },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof findRecordsInput>, object, AirtableClient>) {
    const page = await client.request({
      path: `/${input.baseId}/${input.tableId}`,
      query: {
        filterByFormula: `FIND(${JSON.stringify(input.searchValue)},{${input.searchField}})`,
        view: input.viewId,
      },
      signal: req.signal ?? undefined,
    });

    return z.object({ records: z.array(recordSchema) }).parse(page).records;
  },
});

const mutateRecordInput = identifiedRecordInput.extend({
  fields: fieldsSchema.meta({ label: 'Fields' }),
});

async function patchRecord({
  client,
  input,
  req,
  clean,
}: PieceRunArgs<z.output<typeof mutateRecordInput>, object, AirtableClient> & { clean: boolean }) {
  const fields = clean
    ? Object.fromEntries(
        Object.entries(input.fields).map(([key, value]) => [
          key,
          value === '' || value === undefined ? null : value,
        ]),
      )
    : removeEmpty(input.fields);

  const record = await client.request({
    method: 'PATCH',
    path: `/${input.baseId}/${input.tableId}/${input.recordId}`,
    body: { fields },
    signal: req.signal ?? undefined,
  });

  return recordSchema.parse(record);
}

export const updateRecord = defineAirtableAction({
  slug: 'updateRecord',
  description: 'Update non-empty fields in a record.',
  input: mutateRecordInput,
  output: recordSchema,
  options: recordsOptions,
  async run(args: PieceRunArgs<z.output<typeof mutateRecordInput>, object, AirtableClient>) {
    return patchRecord({ ...args, clean: false });
  },
});

export const cleanRecord = defineAirtableAction({
  slug: 'cleanRecord',
  description: 'Update a record and clear fields with empty values.',
  input: mutateRecordInput,
  output: recordSchema,
  options: recordsOptions,
  async run(args: PieceRunArgs<z.output<typeof mutateRecordInput>, object, AirtableClient>) {
    return patchRecord({ ...args, clean: true });
  },
});

export const deleteRecord = defineAirtableAction({
  slug: 'deleteRecord',
  description: 'Delete a record from a table.',
  input: identifiedRecordInput,
  output: z.object({ id: z.string(), deleted: z.boolean() }).passthrough(),
  options: recordsOptions,
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof identifiedRecordInput>, object, AirtableClient>) {
    return client.request({
      method: 'DELETE',
      path: `/${input.baseId}/${input.tableId}/${input.recordId}`,
      signal: req.signal ?? undefined,
    });
  },
});

const getRecordInput = identifiedRecordInput;

export const getRecord = defineAirtableAction({
  slug: 'getRecord',
  description: 'Get one record by ID.',
  input: getRecordInput,
  output: recordSchema,
  options: recordsOptions,
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof getRecordInput>, object, AirtableClient>) {
    return client.request({
      path: `/${input.baseId}/${input.tableId}/${input.recordId}`,
      signal: req.signal ?? undefined,
    });
  },
});

const commentInput = identifiedRecordInput.extend({
  text: z.string().min(1).meta({ label: 'Comment text' }),
  parentCommentId: z.string().optional().meta({ label: 'Parent comment ID' }),
});

export const addRecordComment = defineAirtableAction({
  slug: 'addRecordComment',
  description: 'Add a comment or threaded reply to a record.',
  input: commentInput,
  output: commentSchema,
  options: recordsOptions,
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof commentInput>, object, AirtableClient>) {
    return client.request({
      method: 'POST',
      path: `/${input.baseId}/${input.tableId}/${input.recordId}/comments`,
      body: { text: input.text, parentCommentId: input.parentCommentId },
      signal: req.signal ?? undefined,
    });
  },
});

const uploadInput = z.object({
  ...selectionSchema,
  recordId: z.string().min(1).meta({ label: 'Record ID' }),
  attachmentFieldId: z.string().min(1).meta({ label: 'Attachment field' }),
  fileId: z.union([z.string(), z.number()]).meta({ label: 'File' }),
  contentType: z.string().min(1).meta({ label: 'File content type' }),
  filename: z.string().optional().meta({ label: 'File name' }),
});

async function loadFile(req: FrogBotRequest, fileId: string | number) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('Airtable attachment uploads require a configured files collection.');
  }

  const doc = await req.frogbot.findByID({
    collection,
    id: fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof doc.url !== 'string') throw new Error(`File '${fileId}' is unavailable.`);

  const config = await req.frogbot.config._internal.payloadConfig;
  const base = new URL(config.serverURL || req.url!);
  const url = new URL(doc.url, base);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid file URL.');
  }

  const headers = new Headers();

  if (url.origin === base.origin) {
    for (const name of ['authorization', 'cookie']) {
      const value = req.headers.get(name);

      if (value) headers.set(name, value);
    }
  }

  const response = await fetch(url, {
    headers,
    signal: req.signal ?? undefined,
    redirect: 'error',
  });

  if (!response.ok) throw new Error(`File '${fileId}' is unavailable (${response.status}).`);

  return {
    base64: Buffer.from(await response.arrayBuffer()).toString('base64'),
    filename: String(doc.filename ?? 'upload'),
  };
}

export const uploadAttachment = defineAirtableAction({
  slug: 'uploadAttachment',
  description: 'Upload a FrogBot file to an attachment field.',
  input: uploadInput,
  output: recordSchema,
  options: {
    ...recordsOptions,
    attachmentFieldId: attachmentOptions,
  },
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof uploadInput>, object, AirtableClient>) {
    const file = await loadFile(req, input.fileId);

    return client.request({
      method: 'POST',
      baseUrl: 'https://content.airtable.com/v0',
      path: `/${input.baseId}/${input.recordId}/${input.attachmentFieldId}/uploadAttachment`,
      body: {
        contentType: input.contentType,
        file: file.base64,
        filename: input.filename ?? file.filename,
      },
      signal: req.signal ?? undefined,
    });
  },
});

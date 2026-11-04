import { z } from 'zod';

import { signal } from '../client.js';
import { dataRoot, recordId } from '../config.js';
import { defineAction } from '../define.js';
import { fileInput, loadFile } from '../files.js';
import { created, queryPage, soqlString } from '../records.js';

export const uploadFile = defineAction({
  slug: 'uploadFile',
  label: 'Add File to Record',
  description: 'Upload a FrogBot file to Salesforce Files and share it with a record.',
  input: z.object({ recordId: recordId('Record ID'), file: fileInput }),
  output: created,
  idempotent: false,
  async run({ client, input, req }) {
    const file = await loadFile(req, input.file);

    return client.request(created, {
      method: 'POST',
      path: `${dataRoot}/sobjects/ContentVersion`,
      body: {
        Title: file.name,
        PathOnClient: file.name,
        VersionData: Buffer.from(file.data).toString('base64'),
        FirstPublishLocationId: input.recordId,
      },
      signal: signal(req),
    });
  },
});

export const createAttachment = defineAction({
  slug: 'createAttachment',
  label: 'Create Attachment (Legacy)',
  description:
    'Attach a FrogBot file to a record as a classic Attachment. Salesforce recommends Add File to Record instead.',
  input: z.object({ parentId: recordId('Record ID'), file: fileInput }),
  output: created,
  idempotent: false,
  async run({ client, input, req }) {
    const file = await loadFile(req, input.file);

    return client.request(created, {
      method: 'POST',
      path: `${dataRoot}/sobjects/Attachment`,
      body: {
        ParentId: input.parentId,
        Name: file.name,
        Body: Buffer.from(file.data).toString('base64'),
      },
      signal: signal(req),
    });
  },
});

const attachment = z.object({
  Id: z.string(),
  Name: z.string(),
  BodyLength: z.number().nullish(),
  ContentType: z.string().nullish(),
});

const document = z.object({ Id: z.string(), Title: z.string() });

export const listAttachments = defineAction({
  slug: 'listAttachments',
  label: 'Get Record Attachments',
  description:
    "List a record's classic Attachments and its Files, without their contents. Up to 2,000 of each.",
  input: z.object({ recordId: recordId('Record ID') }),
  output: z.object({ attachments: z.array(attachment), files: z.array(document) }),
  idempotent: true,
  async run({ client, input, req }) {
    const id = soqlString(input.recordId);
    const [attachments, links] = await Promise.all([
      client.request(queryPage, {
        path: `${dataRoot}/query`,
        query: {
          q: `SELECT Id, Name, BodyLength, ContentType FROM Attachment WHERE ParentId = ${id}`,
        },
        signal: signal(req),
      }),
      client.request(queryPage, {
        path: `${dataRoot}/query`,
        query: {
          q: `SELECT ContentDocument.Id, ContentDocument.Title FROM ContentDocumentLink WHERE LinkedEntityId = ${id}`,
        },
        signal: signal(req),
      }),
    ]);

    return {
      attachments: z.array(attachment).parse(attachments.records),
      files: links.records.map((link) => document.parse(link.ContentDocument)),
    };
  },
});

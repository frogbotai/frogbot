import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { fileInput, loadFile } from '../files.js';
import { folderOptions } from './options.js';

const uploaded = z.object({
  id: z.string(),
  name: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  defaultHostingUrl: z.string().optional(),
  size: z.number().optional(),
  type: z.string().optional(),
  extension: z.string().optional(),
  access: z.string().optional(),
  parentFolderId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const uploadFile = defineAction({
  slug: 'uploadFile',
  description: "Upload a FrogBot file to a folder in HubSpot's file manager.",
  input: z.object({
    folderId: z.string().regex(/^\d+$/).meta({ label: 'Folder' }),
    fileName: z.string().min(1).meta({ label: 'File name' }),
    accessLevel: z
      .enum(['PUBLIC_INDEXABLE', 'PUBLIC_NOT_INDEXABLE', 'PRIVATE'])
      .meta({ label: 'Access level' }),
    file: fileInput,
  }),
  output: uploaded,
  idempotent: false,
  options: { folderId: folderOptions },
  async run({ client, input, req }) {
    const file = await loadFile(req, input.file);
    const form = new FormData();

    form.append('file', new Blob([file.data], { type: file.mimeType }), input.fileName);
    form.append('folderId', input.folderId);
    form.append('fileName', input.fileName);
    form.append('options', JSON.stringify({ access: input.accessLevel }));

    return client.request(uploaded, {
      method: 'POST',
      path: '/files/v3/files',
      body: form,
      signal: signal(req),
    });
  },
});

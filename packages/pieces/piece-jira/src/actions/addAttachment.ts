import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { fileInput, loadFile } from '../files.js';
import { attachment, issuePath } from '../records.js';
import { issueOptions } from './options.js';

export const addAttachment = defineAction({
  slug: 'addAttachment',
  description: 'Attach a FrogBot file to a Jira issue.',
  input: z.object({ issueKey, file: fileInput }),
  output: z.array(attachment),
  idempotent: false,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    const file = await loadFile(req, input.file);
    const form = new FormData();

    form.append('file', new Blob([file.data], { type: file.mimeType }), file.name);

    return client.request(z.array(attachment), {
      method: 'POST',
      path: issuePath(input.issueKey, '/attachments'),
      headers: { 'X-Atlassian-Token': 'no-check' },
      body: form,
      signal: signal(req),
    });
  },
});

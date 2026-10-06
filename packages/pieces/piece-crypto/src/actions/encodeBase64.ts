import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({ text: z.string().meta({ label: 'Text' }) });

export const encodeBase64 = defineAction({
  slug: 'encodeBase64',
  label: 'Encode Base64',
  description: 'Encode UTF-8 text as Base64.',
  input: inputSchema,
  output: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  run({ input }) {
    return Promise.resolve(Buffer.from(input.text).toString('base64'));
  },
});

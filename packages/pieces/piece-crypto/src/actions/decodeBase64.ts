import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({ text: z.string().meta({ label: 'Text' }) });

export const decodeBase64 = defineAction({
  slug: 'decodeBase64',
  label: 'Decode Base64',
  description: 'Decode Base64 text as UTF-8.',
  input: inputSchema,
  output: z.string(),
  async run({ input }) {
    return Buffer.from(input.text, 'base64').toString();
  },
});

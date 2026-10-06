import { createHash } from 'node:crypto';

import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  method: z.enum(['md5', 'sha256', 'sha512', 'sha3-512']).meta({ label: 'Method' }),
  text: z.string().meta({ label: 'Text', description: 'The text to hash' }),
});

export const hashText = defineAction({
  slug: 'hashText',
  label: 'Hash Text',
  description: 'Hash text with a selected digest algorithm.',
  input: inputSchema,
  output: z.string().regex(/^[a-f0-9]+$/),
  run({ input }) {
    return Promise.resolve(createHash(input.method).update(input.text).digest('hex'));
  },
});

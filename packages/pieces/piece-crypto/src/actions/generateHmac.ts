import { createHmac } from 'node:crypto';

import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  secretKey: z.string().meta({ label: 'Secret Key', secret: true }),
  secretKeyEncoding: z.enum(['utf-8', 'hex', 'base64']).meta({ label: 'Secret Key Encoding' }),
  method: z.enum(['md5', 'sha256', 'sha512']).meta({ label: 'Method' }),
  text: z.string().meta({ label: 'Text', description: 'The text to sign' }),
  outputEncoding: z.enum(['hex', 'base64']).default('hex').meta({ label: 'Output Encoding' }),
});

export const generateHmac = defineAction({
  slug: 'generateHmac',
  label: 'Generate HMAC',
  description: 'Generate a keyed hash-based message authentication code.',
  input: inputSchema,
  output: z.string().min(1),
  run({ input }) {
    const key = Buffer.from(input.secretKey, input.secretKeyEncoding);

    return Promise.resolve(
      createHmac(input.method, key).update(input.text).digest(input.outputEncoding),
    );
  },
});

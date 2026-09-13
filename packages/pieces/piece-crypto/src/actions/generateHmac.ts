import { createHmac } from 'node:crypto';

import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  secretKey: z.string().meta({ label: 'Secret Key', secret: true }),
  secretKeyEncoding: z.enum(['utf-8', 'hex', 'base64']).meta({ label: 'Secret Key Encoding' }),
  method: z.enum(['md5', 'sha256', 'sha512']).meta({ label: 'Method' }),
  text: z.string().meta({ label: 'Text', description: 'The text to sign' }),
  outputEncoding: z.enum(['hex', 'base64']).default('hex').meta({ label: 'Output Encoding' }),
});

export const generateHmac = {
  slug: 'generateHmac',
  label: 'Generate HMAC',
  description: 'Generate a keyed hash-based message authentication code.',
  input: inputSchema,
  output: z.string().min(1),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const key = Buffer.from(input.secretKey, input.secretKeyEncoding);

    return createHmac(input.method, key).update(input.text).digest(input.outputEncoding);
  },
};

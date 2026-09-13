import { createSign } from 'node:crypto';

import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  privateKey: z.string().meta({ label: 'Private Key', secret: true }),
  passphrase: z.string().optional().meta({ label: 'Passphrase', secret: true }),
  method: z.enum(['sha256', 'sha384', 'sha512']).default('sha256').meta({ label: 'Method' }),
  text: z.string().meta({ label: 'Text', description: 'The text to sign' }),
  outputEncoding: z.enum(['base64', 'hex']).default('base64').meta({ label: 'Output Encoding' }),
});

export const generateRsaSignature = {
  slug: 'generateRsaSignature',
  label: 'Generate RSA Signature',
  description: 'Sign text with an RSA private key.',
  input: inputSchema,
  output: z.string().min(1),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const signer = createSign(input.method).update(input.text);
    const key = input.passphrase
      ? { key: input.privateKey, passphrase: input.passphrase }
      : input.privateKey;

    signer.end();

    return signer.sign(key, input.outputEncoding);
  },
};

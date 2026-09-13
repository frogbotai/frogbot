import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({ text: z.string().meta({ label: 'Text' }) });

export const encodeBase64 = {
  slug: 'encodeBase64',
  label: 'Encode Base64',
  description: 'Encode UTF-8 text as Base64.',
  input: inputSchema,
  output: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    return Buffer.from(input.text).toString('base64');
  },
};

import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({ text: z.string().meta({ label: 'Text' }) });

export const decodeBase64 = {
  slug: 'decodeBase64',
  label: 'Decode Base64',
  description: 'Decode Base64 text as UTF-8.',
  input: inputSchema,
  output: z.string(),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    return Buffer.from(input.text, 'base64').toString();
  },
};

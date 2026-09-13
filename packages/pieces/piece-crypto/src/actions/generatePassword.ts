import { randomInt } from 'node:crypto';

import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const alphanumeric = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const symbols = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
const inputSchema = z.object({
  length: z.number().int().min(0).max(256).meta({ label: 'Password Length' }),
  characterSet: z
    .enum(['alphanumeric', 'alphanumeric-symbols'])
    .default('alphanumeric')
    .meta({ label: 'Character Set' }),
});

export const generatePassword = {
  slug: 'generatePassword',
  label: 'Generate Password',
  description: 'Generate a cryptographically secure random password.',
  input: inputSchema,
  output: z.string().max(256),
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const characters =
      input.characterSet === 'alphanumeric' ? alphanumeric : alphanumeric + symbols;
    let password = '';

    for (let index = 0; index < input.length; index++) {
      password += characters[randomInt(characters.length)];
    }

    return password;
  },
};

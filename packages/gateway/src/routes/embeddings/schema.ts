import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

const tokenSchema = z.number().int();
const tokenArraySchema = z.array(tokenSchema).min(1, 'input token array must contain at least one token');

const embeddingsRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  input: z.union([
    z.string().min(1, 'input must be a non-empty string'),
    tokenArraySchema,
    z.array(z.string().min(1, 'input strings must be non-empty')).min(1, 'input array must contain at least one string').max(2048, 'input array must contain at most 2048 items'),
    z.array(tokenArraySchema).min(1, 'input array must contain at least one token array').max(2048, 'input array must contain at most 2048 items'),
  ]),
  dimensions: z.number().int().positive().nullish(),
  encoding_format: z.enum(['float', 'base64']).nullish(),
  user: z.string().nullish(),
}).loose();

export type EmbeddingsRequest = z.infer<typeof embeddingsRequestSchema>;

export function parseEmbeddingsRequest(input: unknown): EmbeddingsRequest {
  return parseWithSchema(embeddingsRequestSchema, input);
}

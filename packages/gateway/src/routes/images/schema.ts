import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

const imagesRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  prompt: z.string().min(1, 'prompt must be a non-empty string'),
  n: z.number().int().positive().nullish(),
  size: z.union([
    z.string().regex(/^\d+x\d+$/, 'size must use WIDTHxHEIGHT format'),
    z.literal('auto'),
  ]).nullish(),
  quality: z.string().nullish(),
  style: z.string().nullish(),
  background: z.enum(['transparent', 'opaque', 'auto']).nullish(),
  moderation: z.enum(['auto', 'low']).nullish(),
  output_format: z.enum(['png', 'jpeg', 'webp']).nullish(),
  output_compression: z.number().int().min(0).max(100).nullish(),
  response_format: z.enum(['b64_json', 'url']).nullish(),
  user: z.string().nullish(),
}).loose();

export type ImagesRequest = z.infer<typeof imagesRequestSchema>;

export function parseImagesRequest(input: unknown): ImagesRequest {
  return parseWithSchema(imagesRequestSchema, input);
}

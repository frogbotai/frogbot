import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

const videosRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  prompt: z.string().min(1, 'prompt must be a non-empty string'),
  n: z.number().int().positive().nullish(),
  aspect_ratio: z.string().regex(/^\d+:\d+$/, 'aspect_ratio must use WIDTH:HEIGHT format').nullish(),
  resolution: z.string().regex(/^\d+x\d+$/, 'resolution must use WIDTHxHEIGHT format').nullish(),
  duration: z.number().positive().nullish(),
  fps: z.number().positive().nullish(),
  seed: z.number().int().nullish(),
  generate_audio: z.boolean().nullish(),
  response_format: z.enum(['b64_json', 'url']).nullish(),
  timeout_ms: z.number().int().positive().nullish(),
  poll_timeout_ms: z.number().int().positive().nullish(),
  poll_interval_ms: z.number().int().positive().nullish(),
  user: z.string().nullish(),
}).loose();

export type VideosRequest = z.infer<typeof videosRequestSchema>;

export function parseVideosRequest(input: unknown): VideosRequest {
  return parseWithSchema(videosRequestSchema, input);
}

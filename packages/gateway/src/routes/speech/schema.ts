import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

export const speechResponseFormats = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] as const;

const speechRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  input: z.string().min(1, 'input must be a non-empty string'),
  voice: z.string().min(1, 'voice must be a non-empty string'),
  response_format: z.enum(speechResponseFormats).nullish(),
  speed: z.number().positive().nullish(),
  instructions: z.string().nullish(),
  language: z.string().nullish(),
  user: z.string().nullish(),
}).loose();

export type SpeechRequest = z.infer<typeof speechRequestSchema>;
export type SpeechResponseFormat = (typeof speechResponseFormats)[number];

export function parseSpeechRequest(input: unknown): SpeechRequest {
  return parseWithSchema(speechRequestSchema, input);
}

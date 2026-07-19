import { z } from 'zod';

import { parseWithSchema } from '../../shared/parseWithSchema.js';

export const transcriptionResponseFormats = ['json', 'text', 'srt', 'verbose_json', 'vtt'] as const;
export const timestampGranularities = ['word', 'segment'] as const;

const transcriptionRequestSchema = z.object({
  model: z.string().min(1, 'model must be a non-empty string'),
  file: z.instanceof(File),
  response_format: z.enum(transcriptionResponseFormats).nullish(),
  language: z.string().nullish(),
  prompt: z.string().nullish(),
  temperature: z.coerce.number().min(0).max(1).nullish(),
  timestamp_granularities: z.union([
    z.enum(timestampGranularities),
    z.array(z.enum(timestampGranularities)),
  ]).nullish(),
  stream: z.preprocess(
    (val) => (typeof val === 'string' ? val === 'true' : val),
    z.boolean().nullish().refine((val) => val !== true, {
      message:
        'streaming transcription is not supported by the gateway; use stream=false or omit the parameter',
    }),
  ),
}).loose();

export type TranscriptionRequest = z.infer<typeof transcriptionRequestSchema>;
export type TranscriptionResponseFormat = (typeof transcriptionResponseFormats)[number];

export function parseTranscriptionRequest(input: unknown): TranscriptionRequest {
  return parseWithSchema(transcriptionRequestSchema, input);
}

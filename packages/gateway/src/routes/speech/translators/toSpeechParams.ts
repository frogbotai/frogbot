import type { SpeechRequest, SpeechResponseFormat } from '../schema.js';

export type SpeechParams = {
  text: string;
  voice: string;
  outputFormat: SpeechResponseFormat;
  instructions?: string;
  speed?: number;
  language?: string;
  providerOptions: Record<string, Record<string, never>>;
};

export function toSpeechParams(body: SpeechRequest): SpeechParams {
  const format = body.response_format ?? 'mp3';
  return {
    text: body.input,
    voice: body.voice,
    outputFormat: format,
    ...(body.instructions != null && { instructions: body.instructions }),
    ...(body.speed != null && { speed: body.speed }),
    ...(body.language != null && { language: body.language }),
    providerOptions: {},
  };
}

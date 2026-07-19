import type { TranscriptionResult } from 'ai';

import type { TranscriptionResponseFormat } from '../schema.js';

export type OpenAITranscriptionResponse =
  | { text: string }
  | {
      task: 'transcribe';
      text: string;
      language: string;
      duration: number;
      words: Array<{ word: string; start: number; end: number }>;
      segments: Array<{
        id: number;
        seek: number;
        start: number;
        end: number;
        text: string;
        tokens: number[];
        temperature: number;
        avg_logprob: number;
        compression_ratio: number;
        no_speech_prob: number;
      }>;
    }
  | string;

export function toOpenAITranscriptionResponse(args: {
  result: TranscriptionResult;
  responseFormat: TranscriptionResponseFormat | null | undefined;
}): OpenAITranscriptionResponse {
  const format = args.responseFormat ?? 'json';
  if (format === 'text') return args.result.text;
  if (format === 'srt') return toSrt(args.result.segments);
  if (format === 'vtt') return `WEBVTT\n\n${toVtt(args.result.segments)}`;
  if (format === 'verbose_json') {
    const raw = getRawVerboseJson(args.result);
    return {
      task: 'transcribe',
      text: args.result.text,
      language: raw?.language ?? args.result.language ?? '',
      duration: args.result.durationInSeconds ?? raw?.duration ?? 0,
      words: raw?.words ?? [],
      segments: raw?.segments ?? args.result.segments.map((segment, index) => ({
        id: index,
        seek: 0,
        start: segment.startSecond,
        end: segment.endSecond,
        text: segment.text,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 0,
        no_speech_prob: 0,
      })),
    };
  }
  return { text: args.result.text };
}

type RawVerboseJson = {
  language?: string;
  duration?: number;
  words?: Array<{ word: string; start: number; end: number }>;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
};

function getRawVerboseJson(result: TranscriptionResult): RawVerboseJson | undefined {
  const body = getResponseBody(result.responses[0]);
  return isRawVerboseJson(body) ? body : undefined;
}

// The AI SDK's public TranscriptionModelResponseMetadata omits `body`, but the
// V4 provider result carries it at runtime (e.g. OpenAI attaches the raw
// verbose JSON). Narrow structurally until the upstream type includes it.
function getResponseBody(response: object | undefined): unknown {
  return response && 'body' in response ? response.body : undefined;
}

function isRawVerboseJson(value: unknown): value is RawVerboseJson {
  return typeof value === 'object' && value !== null;
}

function toSrt(segments: TranscriptionResult['segments']) {
  return segments.map((segment, index) => [
    String(index + 1),
    `${formatTimestamp(segment.startSecond, ',')} --> ${formatTimestamp(segment.endSecond, ',')}`,
    segment.text,
  ].join('\n')).join('\n\n');
}

function toVtt(segments: TranscriptionResult['segments']) {
  return segments.map((segment) => [
    `${formatTimestamp(segment.startSecond, '.')} --> ${formatTimestamp(segment.endSecond, '.')}`,
    segment.text,
  ].join('\n')).join('\n\n');
}

function formatTimestamp(seconds: number, decimal: ',' | '.') {
  const milliseconds = Math.round(seconds * 1000);
  const ms = String(milliseconds % 1000).padStart(3, '0');
  const totalSeconds = Math.floor(milliseconds / 1000);
  const s = String(totalSeconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = String(totalMinutes % 60).padStart(2, '0');
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  return `${h}:${m}:${s}${decimal}${ms}`;
}

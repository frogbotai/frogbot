import type { JSONValue } from 'ai';

import type { TranscriptionRequest } from '../schema.js';

export type TranscribeParams = {
  audio: Uint8Array;
  providerOptions: Record<string, Record<string, JSONValue>>;
};

export type ToTranscribeParamsArgs = {
  body: TranscriptionRequest;
  providerName: string;
};

export async function toTranscribeParams(args: ToTranscribeParamsArgs): Promise<TranscribeParams> {
  const { body, providerName } = args;
  const options: Record<string, JSONValue> = {};
  if (body.language != null) {
    options[providerName === 'assemblyai' ? 'languageCode' : 'language'] = body.language;
  }
  if (body.prompt != null) {
    options[providerName === 'gladia' ? 'contextPrompt' : 'prompt'] = body.prompt;
  }
  if (body.temperature != null && providerName === 'openai') {
    options.temperature = body.temperature;
  }
  if (body.timestamp_granularities != null) {
    const timestampGranularities = Array.isArray(body.timestamp_granularities)
      ? body.timestamp_granularities
      : [body.timestamp_granularities];
    if (providerName === 'openai') options.timestampGranularities = timestampGranularities;
    if (providerName === 'deepgram') options.utterances = timestampGranularities.includes('segment');
    if (providerName === 'assemblyai') options.speakerLabels = timestampGranularities.includes('segment');
    if (providerName === 'gladia') options.sentences = timestampGranularities.includes('segment');
  }

  return {
    audio: new Uint8Array(await body.file.arrayBuffer()),
    providerOptions: { [providerName]: options },
  };
}

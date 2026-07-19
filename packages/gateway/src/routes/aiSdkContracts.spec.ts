import { describe, expect, it } from 'vitest';
import type {
  EmbeddingModelV4,
  Experimental_VideoModelV4,
  ImageModelV4,
  RerankingModelV4,
  SpeechModelV4,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  embed,
  experimental_generateVideo,
  generateImage,
  generateSpeech,
  generateText,
  rerank,
  streamText,
  transcribe,
} from 'ai';
import type { LanguageModel } from 'ai';

import { toEmbedParams } from './embeddings/translators/index.js';
import type { EmbeddingsRequest } from './embeddings/schema.js';
import { toGenerateImageParams } from './images/translators/index.js';
import type { ImagesRequest } from './images/schema.js';
import { toRerankParams } from './rerank/translators/index.js';
import type { RerankRequest } from './rerank/schema.js';
import { toModelMessages } from './responses/translators/index.js';
import type { ResponsesRequest } from './responses/schema.js';
import { toSpeechParams } from './speech/translators/index.js';
import type { SpeechRequest } from './speech/schema.js';
import { toTranscribeParams } from './transcriptions/translators/index.js';
import type { TranscriptionRequest } from './transcriptions/schema.js';
import { toGenerateVideoParams } from './videos/translators/index.js';
import type { VideosRequest } from './videos/schema.js';

const embeddingModel = null as never as EmbeddingModelV4;
const imageModel = null as never as ImageModelV4;
const videoModel = null as never as Experimental_VideoModelV4;
const speechModel = null as never as SpeechModelV4;
const transcriptionModel = null as never as TranscriptionModelV4;
const rerankingModel = null as never as RerankingModelV4;
const languageModel = null as never as LanguageModel;

describe('AI SDK modality signature contracts', () => {
  it('embeddings translator output satisfies embed params', () => {
    const { values, providerOptions } = toEmbedParams({
      model: 'openai/text-embedding-3-small',
      input: 'hello',
      dimensions: 256,
    } satisfies EmbeddingsRequest);
    const value = values[0];
    if (typeof value !== 'string') {
      throw new Error('contract fixture must use string input');
    }

    const params = {
      model: embeddingModel,
      value,
      providerOptions,
    } satisfies Parameters<typeof embed>[0];

    expect(params.providerOptions).toHaveProperty('unknown.dimensions', 256);
  });

  it('images translator output satisfies generateImage params', () => {
    const { providerOptions, ...imageParams } = toGenerateImageParams({
      providerName: 'openai',
      body: {
        model: 'openai/dall-e-3',
        prompt: 'frog robot',
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      } satisfies ImagesRequest,
    });

    const params = {
      model: imageModel,
      ...imageParams,
      providerOptions,
    } satisfies Parameters<typeof generateImage>[0];

    expect(params.providerOptions).toHaveProperty('openai.quality', 'standard');
  });

  it('videos translator output satisfies experimental_generateVideo params', () => {
    const { providerOptions, ...videoParams } = toGenerateVideoParams({
      providerName: 'replicate',
      body: {
        model: 'replicate/wan-2.5',
        prompt: 'frog robot',
        response_format: 'b64_json',
        aspect_ratio: '16:9',
        poll_timeout_ms: 1000,
      } satisfies VideosRequest,
    });

    const params = {
      model: videoModel,
      ...videoParams,
      providerOptions,
    } satisfies Parameters<typeof experimental_generateVideo>[0];

    expect(params.providerOptions).toHaveProperty('replicate.pollTimeoutMs', 1000);
  });

  it('speech translator output satisfies generateSpeech params', () => {
    const params = {
      model: speechModel,
      ...toSpeechParams({
        model: 'openai/tts-1',
        input: 'hello',
        voice: 'alloy',
        response_format: 'mp3',
      } satisfies SpeechRequest),
    } satisfies Parameters<typeof generateSpeech>[0];

    expect(params.outputFormat).toBe('mp3');
  });

  it('transcriptions translator output satisfies transcribe params', async () => {
    const { providerOptions, audio } = await toTranscribeParams({
      providerName: 'openai',
      body: {
        model: 'openai/whisper-1',
        file: new File([new Uint8Array([1, 2, 3])], 'tiny.wav', {
          type: 'audio/wav',
        }),
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      } satisfies TranscriptionRequest,
    });

    const params = {
      model: transcriptionModel,
      audio,
      providerOptions,
    } satisfies Parameters<typeof transcribe>[0];

    expect(params.providerOptions).toHaveProperty('openai.timestampGranularities');
  });

  it('rerank translator output satisfies rerank params', () => {
    const { providerOptions, ...rerankParams } = toRerankParams({
      model: 'cohere/rerank-v3.5',
      query: 'frog',
      documents: ['robot', 'frog robot'],
      top_n: 2,
    } satisfies RerankRequest);

    const params = {
      model: rerankingModel,
      ...rerankParams,
      providerOptions,
    } satisfies Parameters<typeof rerank<string>>[0];

    expect(params.topN).toBe(2);
  });

  it('responses translator output satisfies generateText and streamText params', () => {
    const messages = toModelMessages([
      { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
    ] satisfies ResponsesRequest['input']);

    const generateParams = {
      model: languageModel,
      messages,
      providerOptions: { openai: { previousResponseId: 'resp_prev' } },
    } satisfies Parameters<typeof generateText>[0];

    const streamParams = {
      ...generateParams,
      includeRawChunks: true,
    } satisfies Parameters<typeof streamText>[0];

    expect(streamParams.messages).toEqual(messages);
  });
});

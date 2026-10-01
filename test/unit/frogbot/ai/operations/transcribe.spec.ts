import { createGateway, type Gateway } from '@frogbotai/gateway';
import { MockProviderV4, MockTranscriptionModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { transcribeOperation } from '../../../../../packages/frogbot/src/ai/operations/transcribe.js';
import type { SanitizedAIConfig } from '../../../../../packages/frogbot/src/ai/types.js';

const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);

const config = {
  providers: {},
  routers: {},
  hooks: {
    beforeOperation: [],
    beforeUpstream: [],
    afterUpstream: [],
    afterError: [],
    afterOperation: [],
  },
  access: {
    generate: () => true,
    embed: () => true,
    transcribe: () => true,
    rerank: () => true,
    evaluate: () => true,
  },
  telemetry: { enabled: false },
  usage: { slug: 'ai-usage' },
  _internal: { deploymentId: 'test' },
} satisfies SanitizedAIConfig;

function makeModel() {
  const doGenerate = vi.fn(async () => ({
    text: 'Hello from FrogBot',
    segments: [],
    language: 'en',
    durationInSeconds: 1,
    warnings: [],
    response: { timestamp: new Date(0), modelId: 'whisper-1' },
  }));

  return { model: new MockTranscriptionModelV4({ doGenerate }), doGenerate };
}

function makeGateway() {
  const { model, doGenerate } = makeModel();
  const transcribeModel = vi.fn(() => model);

  const operation = vi.fn(() => ({
    start: async () => {},
    finish: async () => {},
    transcribeModel,
  }));

  return { gateway: { operation } as unknown as Gateway, doGenerate };
}

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

const audioInputs = [
  ['Blob', () => new Blob([bytes], { type: 'audio/wav' })],
  ['File', () => new File([bytes], 'clip.wav', { type: 'audio/wav' })],
  ['ReadableStream', () => streamOf([bytes.slice(0, 3), bytes.slice(3)])],
  ['ArrayBuffer', () => bytes.slice().buffer],
  ['Uint8Array', () => bytes.slice()],
  ['Buffer', () => Buffer.from(bytes)],
  ['base64 string', () => Buffer.from(bytes).toString('base64')],
] as const;

describe('transcribeOperation', () => {
  it.each(audioInputs)('sends the bytes of a %s to the provider', async (_name, makeAudio) => {
    const { gateway, doGenerate } = makeGateway();

    const result = await transcribeOperation(
      { gateway, config, logger: console },
      { model: 'openai/whisper-1', audio: makeAudio() },
    );

    expect(result.text).toBe('Hello from FrogBot');
    expect(doGenerate).toHaveBeenCalledOnce();
    expect(new Uint8Array(doGenerate.mock.calls[0][0].audio)).toEqual(bytes);
  });

  it('sends language under the provider name', async () => {
    const { gateway, doGenerate } = makeGateway();

    await transcribeOperation(
      { gateway, config, logger: console },
      {
        model: 'openai/whisper-1',
        audio: bytes,
        language: 'fr',
        providerOptions: { openai: { prompt: 'Bonjour' }, groq: { language: 'de' } },
      },
    );

    expect(doGenerate.mock.calls[0][0].providerOptions).toEqual({
      openai: { language: 'fr', prompt: 'Bonjour' },
      groq: { language: 'de' },
    });
  });

  it('lets providerOptions override language', async () => {
    const { gateway, doGenerate } = makeGateway();

    await transcribeOperation(
      { gateway, config, logger: console },
      {
        model: 'openai/whisper-1',
        audio: bytes,
        language: 'fr',
        providerOptions: { openai: { language: 'es' } },
      },
    );

    expect(doGenerate.mock.calls[0][0].providerOptions).toEqual({ openai: { language: 'es' } });
  });

  it.each([
    ['elevenlabs/scribe_v1', { elevenlabs: { languageCode: 'fr' } }],
    ['assemblyai/best', { assemblyai: { languageCode: 'fr' } }],
    ['google/gemini-3.5-transcribe', { google: { languageCodes: ['fr'] } }],
    ['deepgram/nova-3', { deepgram: { language: 'fr' } }],
  ])('sends language in the option %s reads', async (model, providerOptions) => {
    const { gateway, doGenerate } = makeGateway();

    await transcribeOperation(
      { gateway, config, logger: console },
      { model: model as never, audio: bytes, language: 'fr' },
    );

    expect(doGenerate.mock.calls[0][0].providerOptions).toEqual(providerOptions);
  });

  it('sends no provider options when neither language nor providerOptions is set', async () => {
    const { gateway, doGenerate } = makeGateway();

    await transcribeOperation(
      { gateway, config, logger: console },
      { model: 'openai/whisper-1', audio: bytes },
    );

    expect(doGenerate.mock.calls[0][0].providerOptions).toEqual({});
  });

  it('delivers Blob bytes and language through a real gateway to the provider', async () => {
    const { model, doGenerate } = makeModel();
    const beforeUpstream = vi.fn();

    const gateway = createGateway({
      providers: { groq: { apiKey: 'test-key' } },
      hooks: { beforeUpstream: [beforeUpstream] },
    });

    gateway.registry.groq = new MockProviderV4({
      transcriptionModels: { 'whisper-large-v3': model },
    }) as unknown as typeof gateway.registry.groq;

    const result = await transcribeOperation(
      { gateway, config, logger: console },
      {
        model: 'groq/whisper-large-v3',
        audio: new Blob([bytes], { type: 'audio/wav' }),
        language: 'fr',
      },
    );

    expect(result.text).toBe('Hello from FrogBot');
    expect(doGenerate).toHaveBeenCalledOnce();
    expect(doGenerate.mock.calls[0][0]).toMatchObject({
      audio: bytes,
      providerOptions: { groq: { language: 'fr' } },
    });
    expect(beforeUpstream).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'transcriptions', provider: 'groq' }),
    );
  });
});

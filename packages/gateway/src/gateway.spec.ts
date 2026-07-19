import {
  MockEmbeddingModelV4,
  MockImageModelV4,
  MockLanguageModelV4,
  MockRerankingModelV4,
  MockSpeechModelV4,
  MockTranscriptionModelV4,
  MockVideoModelV4,
} from 'ai/test';
import { generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { createGateway } from './gateway.js';

describe('createGateway', () => {
  it('exposes in-process model resolvers for every gateway modality', () => {
    const chat = new MockLanguageModelV4();
    const embed = new MockEmbeddingModelV4();
    const image = new MockImageModelV4();
    const video = new MockVideoModelV4();
    const speech = new MockSpeechModelV4();
    const transcription = new MockTranscriptionModelV4();
    const rerank = new MockRerankingModelV4();
    const gw = createGateway({ providers: { openai: { apiKey: 'test-key' } } });
    gw.registry.openai = {
      languageModel: () => chat,
      embeddingModel: () => embed,
      imageModel: () => image,
      videoModel: () => video,
      speechModel: () => speech,
      transcriptionModel: () => transcription,
      rerankingModel: () => rerank,
    } as typeof gw.registry.openai;

    expect(gw.chatModel('openai/chat').modelId).toBe(chat.modelId);
    expect(gw.embedModel('openai/embed').modelId).toBe(embed.modelId);
    expect(gw.imageModel('openai/image').modelId).toBe(image.modelId);
    expect(gw.videoModel('openai/video').modelId).toBe(video.modelId);
    expect(gw.speechModel('openai/speech').modelId).toBe(speech.modelId);
    expect(gw.transcribeModel('openai/transcription').modelId).toBe(transcription.modelId);
    expect(gw.rerankModel('openai/rerank').modelId).toBe(rerank.modelId);
  });

  it('exposes configured hooks read-only', () => {
    const hooks = { beforeOperation: [() => undefined] };
    const gw = createGateway({ providers: { openai: { apiKey: 'test-key' } }, hooks });

    expect(gw.hooks).toEqual(hooks);
    expect(Object.isFrozen(gw.hooks)).toBe(true);
  });

  it('runs configured upstream hooks for in-process models', async () => {
    const beforeUpstream = vi.fn();
    const afterUpstream = vi.fn();
    const model = new MockLanguageModelV4({
      doGenerate: () => ({
        content: [{ type: 'text', text: 'hello' }],
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      }),
    });
    const gw = createGateway({
      providers: { openai: { apiKey: 'test-key' } },
      hooks: { beforeUpstream: [beforeUpstream], afterUpstream: [afterUpstream] },
    });
    gw.registry.openai = { languageModel: () => model } as typeof gw.registry.openai;

    await generateText({ model: gw.chatModel('openai/chat'), prompt: 'hi' });

    expect(beforeUpstream).toHaveBeenCalledOnce();
    expect(afterUpstream).toHaveBeenCalledOnce();
  });
});

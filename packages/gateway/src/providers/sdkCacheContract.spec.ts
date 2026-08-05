import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { providerOptionsNamespace } from '../utils/params.js';

function captureProvider(successBody: unknown) {
  let body: Record<string, any> | undefined;
  const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, any>;
    return Response.json(successBody);
  };
  return {
    fetch: fetch as typeof globalThis.fetch,
    getBody: () => {
      if (!body) throw new Error('No request captured');
      return body;
    },
  };
}

const prompt = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hello' }] }];

describe('SDK cache contracts', () => {
  it('Anthropic reads cacheControl from the anthropic namespace', async () => {
    const capture = captureProvider({
      id: 'msg_test', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }],
      model: 'claude-sonnet-4-20250514', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const model = createAnthropic({ apiKey: 'test', fetch: capture.fetch }).languageModel('claude-sonnet-4-20250514') as LanguageModelV4;
    await model.doGenerate({
      prompt: [{ ...prompt[0], content: [{ ...prompt[0].content[0], providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }] }],
    });

    expect(capture.getBody().messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('Bedrock reads cachePoint from the bedrock namespace', async () => {
    const capture = captureProvider({
      output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
      stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 },
    });
    const model = createAmazonBedrock({ apiKey: 'test', region: 'us-east-1', fetch: capture.fetch }).languageModel('anthropic.claude-sonnet-4-20250514-v1:0') as LanguageModelV4;
    await model.doGenerate({
      prompt: [{ ...prompt[0], content: [{ ...prompt[0].content[0], providerOptions: { bedrock: { cachePoint: { type: 'default', ttl: '1h' } } } }] }],
    });

    expect(providerOptionsNamespace('amazon-bedrock')).toBe('bedrock');
    expect(capture.getBody().messages[0].content[1].cachePoint).toEqual({ type: 'default', ttl: '1h' });
  });

  it('OpenAI reads promptCacheBreakpoint from the openai namespace', async () => {
    const capture = captureProvider({
      id: 'chatcmpl_test', object: 'chat.completion', created: 0, model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const model = createOpenAI({ apiKey: 'test', fetch: capture.fetch }).chat('gpt-4o-mini') as LanguageModelV4;
    await model.doGenerate({
      prompt: [{ ...prompt[0], content: [{ ...prompt[0].content[0], providerOptions: { openai: { promptCacheBreakpoint: { mode: 'explicit' } } } }] }],
    });

    expect(capture.getBody().messages[0].content[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit' });
  });

  it('Google reads cachedContent from the google namespace', async () => {
    const capture = captureProvider({
      candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    });
    const model = createGoogleGenerativeAI({ apiKey: 'test', fetch: capture.fetch }).languageModel('gemini-2.5-flash') as LanguageModelV4;
    await model.doGenerate({ prompt, providerOptions: { google: { cachedContent: 'cachedContents/example' } } });

    expect(capture.getBody().cachedContent).toBe('cachedContents/example');
  });
});

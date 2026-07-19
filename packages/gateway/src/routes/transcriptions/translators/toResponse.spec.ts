import { describe, expect, it } from 'vitest';
import type { TranscriptionResult } from 'ai';

import { toOpenAITranscriptionResponse } from './toResponse.js';

const result = {
  text: 'Hello world',
  segments: [
    { text: 'Hello', startSecond: 0, endSecond: 1.25 },
    { text: 'world', startSecond: 1.25, endSecond: 2.5 },
  ],
  language: 'en',
  durationInSeconds: 2.5,
  warnings: [],
  responses: [{
    body: {
      text: 'Hello world',
      language: 'english',
      duration: 2.5,
      words: [{ word: 'Hello', start: 0, end: 1.25 }],
      segments: [{
        id: 0,
        seek: 0,
        start: 0,
        end: 1.25,
        text: 'Hello',
        tokens: [9906],
        temperature: 0,
        avg_logprob: -0.1,
        compression_ratio: 1.1,
        no_speech_prob: 0.01,
      }],
    },
  }],
} as unknown as TranscriptionResult;

describe('toOpenAITranscriptionResponse', () => {
  it('maps verbose_json segments', () => {
    expect(toOpenAITranscriptionResponse({ result, responseFormat: 'verbose_json' })).toEqual({
      task: 'transcribe',
      text: 'Hello world',
      language: 'english',
      duration: 2.5,
      words: [{ word: 'Hello', start: 0, end: 1.25 }],
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 1.25,
          text: 'Hello',
          tokens: [9906],
          temperature: 0,
          avg_logprob: -0.1,
          compression_ratio: 1.1,
          no_speech_prob: 0.01,
        },
      ],
    });
  });

  it('keeps verbose_json language and duration present without upstream values', () => {
    const sparse = {
      text: 'Hello',
      segments: [{ text: 'Hello', startSecond: 0, endSecond: 1 }],
      language: undefined,
      durationInSeconds: undefined,
      warnings: [],
      responses: [],
    } as unknown as TranscriptionResult;

    expect(toOpenAITranscriptionResponse({ result: sparse, responseFormat: 'verbose_json' })).toEqual({
      task: 'transcribe',
      text: 'Hello',
      language: '',
      duration: 0,
      words: [],
      segments: [{
        id: 0,
        seek: 0,
        start: 0,
        end: 1,
        text: 'Hello',
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 0,
        no_speech_prob: 0,
      }],
    });
  });

  it('maps text, srt, and vtt response formats', () => {
    expect(toOpenAITranscriptionResponse({ result, responseFormat: 'text' })).toBe('Hello world');
    expect(toOpenAITranscriptionResponse({ result, responseFormat: 'srt' })).toBe([
      '1',
      '00:00:00,000 --> 00:00:01,250',
      'Hello',
      '',
      '2',
      '00:00:01,250 --> 00:00:02,500',
      'world',
    ].join('\n'));
    expect(toOpenAITranscriptionResponse({ result, responseFormat: 'vtt' })).toBe([
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:01.250',
      'Hello',
      '',
      '00:00:01.250 --> 00:00:02.500',
      'world',
    ].join('\n'));
  });
});

import { describe, it } from 'vitest';

import { describeLive } from '../../live/live.js';
import { type LiveFeature, selectedEntries } from './matrix.js';
import { type LiveApp, makeLiveApp } from './routes.js';
import {
  runChatErrorEnvelope,
  runChatContextOverflow,
  runChatMultiTurn,
  runChatParallelToolCalls,
  runChatStreamAbort,
  runChatStreamingToolCall,
  runChatToolRoundTrip,
  runChatTruncation,
  runMessagesErrorEnvelope,
  runMessagesMultiTurn,
  runMessagesToolRoundTrip,
  runMessagesTruncation,
  runResponsesErrorEnvelope,
  runResponsesMultiTurn,
  runResponsesToolRoundTrip,
  runResponsesTruncation,
} from './scenarios.js';
import {
  runChatAudio,
  runChatImageFollowUp,
  runChatMultiImage,
  runChatPdf,
  runChatReasoning,
  runChatStructuredOutput,
  runChatVision,
  runChatVisionStream,
  runChatVisionToolCall,
  runMessagesPdf,
  runMessagesThinking,
  runMessagesThinkingToolLoop,
  runMessagesVision,
  runResponsesPdf,
  runResponsesReasoning,
  runResponsesStructuredOutput,
  runResponsesVision,
} from './userScenarios.js';

const TEST_TIMEOUT = 180_000;

describe.concurrent('live scenarios', () => {
  for (const entry of selectedEntries()) {
    if (!entry.text) continue;

    const model = `${entry.label}/${entry.text.model}`;
    const features = new Set<LiveFeature>(entry.text.features);
    const lacks = (feature: LiveFeature) => !features.has(feature);

    describeLive(`live scenarios: ${model}`, entry, () => {
      let app: LiveApp | undefined;

      const getApp = () => (app ??= makeLiveApp(entry));

      const run = (scenario: (app: LiveApp, model: string) => Promise<void>) => () =>
        scenario(getApp(), model);

      describe.skipIf(lacks('tools'))('tool calls', () => {
        it('chat: tool call, result, final answer', run(runChatToolRoundTrip), TEST_TIMEOUT);
        it('messages: tool use, result, final answer', run(runMessagesToolRoundTrip), TEST_TIMEOUT);
        it(
          'responses: function call, output, final answer',
          run(runResponsesToolRoundTrip),
          TEST_TIMEOUT,
        );
        it('chat: streamed tool-call deltas coalesce', run(runChatStreamingToolCall), TEST_TIMEOUT);
        it(
          'chat: parallel tool calls have unique ids',
          run(runChatParallelToolCalls),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('vision'))('images', () => {
        it('chat: reads the total from a receipt photo', run(runChatVision), TEST_TIMEOUT);
        it('chat: streams an answer about a receipt photo', run(runChatVisionStream), TEST_TIMEOUT);
        it('messages: reads the total from a receipt photo', run(runMessagesVision), TEST_TIMEOUT);
        it(
          'responses: reads the total from a receipt photo',
          run(runResponsesVision),
          TEST_TIMEOUT,
        );
        it('chat: answers about two images in one message', run(runChatMultiImage), TEST_TIMEOUT);
        it(
          'chat: answers a follow-up about an earlier image',
          run(runChatImageFollowUp),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('vision') || lacks('tools'))('images with tools', () => {
        it(
          'chat: records an expense from a receipt photo',
          run(runChatVisionToolCall),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('pdf'))('PDFs', () => {
        it('chat: finds a fact on page 2', run(runChatPdf), TEST_TIMEOUT);
        it('messages: finds a fact on page 2', run(runMessagesPdf), TEST_TIMEOUT);
        it('responses: finds a fact on page 2', run(runResponsesPdf), TEST_TIMEOUT);
      });

      describe.skipIf(lacks('audio'))('audio input', () => {
        it('chat: transcribes a spoken recording', run(runChatAudio), TEST_TIMEOUT);
      });

      describe.skipIf(lacks('json'))('structured output', () => {
        it(
          'chat: extracts a receipt into a strict schema',
          run(runChatStructuredOutput),
          TEST_TIMEOUT,
        );
        it(
          'responses: extracts a receipt into a strict schema',
          run(runResponsesStructuredOutput),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('reasoning'))('reasoning effort', () => {
        it('chat: solves a puzzle with low effort', run(runChatReasoning), TEST_TIMEOUT);
        it('responses: solves a puzzle with low effort', run(runResponsesReasoning), TEST_TIMEOUT);
      });

      describe.skipIf(lacks('thinking'))('extended thinking', () => {
        it(
          'messages: returns signed thinking and a correct answer',
          run(runMessagesThinking),
          TEST_TIMEOUT,
        );
        it(
          'messages: keeps thinking through a tool loop',
          run(runMessagesThinkingToolLoop),
          TEST_TIMEOUT,
        );
      });

      describe('multi-turn recall', () => {
        it('chat', run(runChatMultiTurn), TEST_TIMEOUT);
        it('messages', run(runMessagesMultiTurn), TEST_TIMEOUT);
        it('responses', run(runResponsesMultiTurn), TEST_TIMEOUT);
      });

      describe('truncation', () => {
        it('chat: finish_reason is length', run(runChatTruncation), TEST_TIMEOUT);
        it('messages: stop_reason is max_tokens', run(runMessagesTruncation), TEST_TIMEOUT);
        it('responses: output budget binds', run(runResponsesTruncation), TEST_TIMEOUT);
      });

      describe('error envelopes for an unknown model', () => {
        it(
          'chat: OpenAI error shape',
          () => runChatErrorEnvelope(getApp(), entry.label),
          TEST_TIMEOUT,
        );
        it(
          'messages: Anthropic error shape',
          () => runMessagesErrorEnvelope(getApp(), entry.label),
          TEST_TIMEOUT,
        );
        it(
          'responses: error object',
          () => runResponsesErrorEnvelope(getApp(), entry.label),
          TEST_TIMEOUT,
        );
      });

      describe('resilience', () => {
        it(
          'a client abort mid-stream leaves the app healthy',
          () => runChatStreamAbort(getApp(), model, entry.label),
          TEST_TIMEOUT,
        );
        it(
          'an oversized prompt returns context_length_exceeded',
          run(runChatContextOverflow),
          TEST_TIMEOUT,
        );
      });
    });
  }
});

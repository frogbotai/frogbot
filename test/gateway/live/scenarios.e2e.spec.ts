import { describe, it } from 'vitest';

import { describeLive } from '../../live/live.js';
import { type LiveFeature, selectedEntries } from './matrix.js';
import { type LiveApp, makeLiveApp } from './routes.js';
import {
  expectChatContextOverflow,
  expectChatErrorEnvelope,
  expectChatMultiTurn,
  expectChatParallelToolCalls,
  expectChatStreamAbort,
  expectChatStreamingToolCall,
  expectChatToolRoundTrip,
  expectChatTruncation,
  expectMessagesErrorEnvelope,
  expectMessagesMultiTurn,
  expectMessagesToolRoundTrip,
  expectMessagesTruncation,
  expectResponsesErrorEnvelope,
  expectResponsesMultiTurn,
  expectResponsesToolRoundTrip,
  expectResponsesTruncation,
} from './scenarios.js';
import {
  expectChatAudio,
  expectChatImageFollowUp,
  expectChatMultiImage,
  expectChatPdf,
  expectChatReasoning,
  expectChatStructuredOutput,
  expectChatVision,
  expectChatVisionStream,
  expectChatVisionToolCall,
  expectMessagesPdf,
  expectMessagesThinking,
  expectMessagesThinkingToolLoop,
  expectMessagesVision,
  expectResponsesPdf,
  expectResponsesReasoning,
  expectResponsesStructuredOutput,
  expectResponsesVision,
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

      const expectScenario = (scenario: (app: LiveApp, model: string) => Promise<void>) => () =>
        scenario(getApp(), model);

      describe.skipIf(lacks('tools'))('tool calls', () => {
        it(
          'chat: tool call, result, final answer',
          expectScenario(expectChatToolRoundTrip),
          TEST_TIMEOUT,
        );

        it(
          'messages: tool use, result, final answer',
          expectScenario(expectMessagesToolRoundTrip),
          TEST_TIMEOUT,
        );

        it(
          'responses: function call, output, final answer',
          expectScenario(expectResponsesToolRoundTrip),
          TEST_TIMEOUT,
        );

        it(
          'chat: streamed tool-call deltas coalesce',
          expectScenario(expectChatStreamingToolCall),
          TEST_TIMEOUT,
        );

        it(
          'chat: parallel tool calls have unique ids',
          expectScenario(expectChatParallelToolCalls),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('vision'))('images', () => {
        it(
          'chat: reads the total from a receipt photo',
          expectScenario(expectChatVision),
          TEST_TIMEOUT,
        );

        it(
          'chat: streams an answer about a receipt photo',
          expectScenario(expectChatVisionStream),
          TEST_TIMEOUT,
        );

        it(
          'messages: reads the total from a receipt photo',
          expectScenario(expectMessagesVision),
          TEST_TIMEOUT,
        );

        it(
          'responses: reads the total from a receipt photo',
          expectScenario(expectResponsesVision),
          TEST_TIMEOUT,
        );

        it(
          'chat: answers about two images in one message',
          expectScenario(expectChatMultiImage),
          TEST_TIMEOUT,
        );

        it(
          'chat: answers a follow-up about an earlier image',
          expectScenario(expectChatImageFollowUp),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('vision') || lacks('tools'))('images with tools', () => {
        it(
          'chat: records an expense from a receipt photo',
          expectScenario(expectChatVisionToolCall),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('pdf'))('PDFs', () => {
        it('chat: finds a fact on page 2', expectScenario(expectChatPdf), TEST_TIMEOUT);
        it('messages: finds a fact on page 2', expectScenario(expectMessagesPdf), TEST_TIMEOUT);
        it('responses: finds a fact on page 2', expectScenario(expectResponsesPdf), TEST_TIMEOUT);
      });

      describe.skipIf(lacks('audio'))('audio input', () => {
        it('chat: transcribes a spoken recording', expectScenario(expectChatAudio), TEST_TIMEOUT);
      });

      describe.skipIf(lacks('json'))('structured output', () => {
        it(
          'chat: extracts a receipt into a strict schema',
          expectScenario(expectChatStructuredOutput),
          TEST_TIMEOUT,
        );

        it(
          'responses: extracts a receipt into a strict schema',
          expectScenario(expectResponsesStructuredOutput),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('reasoning'))('reasoning effort', () => {
        it(
          'chat: solves a puzzle with low effort',
          expectScenario(expectChatReasoning),
          TEST_TIMEOUT,
        );

        it(
          'responses: solves a puzzle with low effort',
          expectScenario(expectResponsesReasoning),
          TEST_TIMEOUT,
        );
      });

      describe.skipIf(lacks('thinking'))('extended thinking', () => {
        it(
          'messages: returns signed thinking and a correct answer',
          expectScenario(expectMessagesThinking),
          TEST_TIMEOUT,
        );

        it(
          'messages: keeps thinking through a tool loop',
          expectScenario(expectMessagesThinkingToolLoop),
          TEST_TIMEOUT,
        );
      });

      describe('multi-turn recall', () => {
        it('chat', expectScenario(expectChatMultiTurn), TEST_TIMEOUT);
        it('messages', expectScenario(expectMessagesMultiTurn), TEST_TIMEOUT);
        it('responses', expectScenario(expectResponsesMultiTurn), TEST_TIMEOUT);
      });

      describe('truncation', () => {
        it('chat: finish_reason is length', expectScenario(expectChatTruncation), TEST_TIMEOUT);

        it(
          'messages: stop_reason is max_tokens',
          expectScenario(expectMessagesTruncation),
          TEST_TIMEOUT,
        );

        it(
          'responses: output budget binds',
          expectScenario(expectResponsesTruncation),
          TEST_TIMEOUT,
        );
      });

      describe('error envelopes for an unknown model', () => {
        it(
          'chat: OpenAI error shape',
          () => expectChatErrorEnvelope(getApp(), entry.label),
          TEST_TIMEOUT,
        );

        it(
          'messages: Anthropic error shape',
          () => expectMessagesErrorEnvelope(getApp(), entry.label),
          TEST_TIMEOUT,
        );

        it(
          'responses: error object',
          () => expectResponsesErrorEnvelope(getApp(), entry.label),
          TEST_TIMEOUT,
        );
      });

      describe('resilience', () => {
        it(
          'a client abort mid-stream leaves the app healthy',
          () => expectChatStreamAbort(getApp(), model, entry.label),
          TEST_TIMEOUT,
        );

        it(
          'an oversized prompt returns context_length_exceeded',
          expectScenario(expectChatContextOverflow),
          TEST_TIMEOUT,
        );
      });
    });
  }
});

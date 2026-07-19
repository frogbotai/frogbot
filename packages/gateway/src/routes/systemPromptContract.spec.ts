// Runtime contract tier for the ai@7 system→instructions rename (G155).
//
// aiSdkContracts.spec.ts proves our translator OUTPUT satisfies the AI SDK
// param TYPES (`satisfies Parameters<typeof generateText>[0]`). Types cannot
// catch a RUNTIME rename like ai@7's system→instructions: `standardizePrompt`
// now THROWS `InvalidPromptError` on any `role: 'system'` message in
// `messages` unless `allowSystemInMessages: true` is passed (vercel/ai #15110).
// That is exactly how G155 slipped past the whole type-checked/mock suite:
// every text route builds `role: 'system'` messages from its translator, and
// only the handler's `allowSystemInMessages: true` flag keeps the real SDK
// pipeline from 400ing on them.
//
// These tests take each text route's REAL translator output (chat, messages,
// responses `toModelMessages`) and run it through the REAL `generateText`
// (real `standardizePrompt`, mock model — no network), mirroring the handler
// call site exactly. They assert:
//   (a) generateText does NOT throw (the G155 failure mode), and
//   (b) the mock model's captured `prompt` actually received the system content.
//
// Proof this catches the G155 class: remove `allowSystemInMessages: true` from
// the `generateText` call below and every test throws
// `InvalidPromptError: Invalid prompt: System messages are not allowed ...`,
// failing (a). The handlers pass this exact flag (chatCompletions/handler.ts,
// messages/handler.ts, responses/handler.ts); if any regresses, that route's
// live requests 400 on any system prompt — the defect this tier guards.

import { generateText } from 'ai';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { toModelMessages as chatToModelMessages } from './chatCompletions/translators/index.js';
import type { OpenAIMessage } from './chatCompletions/translators/index.js';
import { toModelMessages as messagesToModelMessages } from './messages/translators/index.js';
import type { AnthropicMessage } from './messages/translators/index.js';
import { toModelMessages as responsesToModelMessages } from './responses/translators/index.js';
import type { ResponsesRequest } from './responses/schema.js';

// A mock model that returns a minimal valid non-streaming result and records
// every `doGenerate` call (MockLanguageModelV4.doGenerateCalls), so we can
// inspect the exact `prompt` the real SDK pipeline handed the model AFTER
// `standardizePrompt` accepted it.
function recordingModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      warnings: [],
    }),
  });
}

// Mirrors the handler call site: real translator output → real generateText
// with `allowSystemInMessages: true`. Returns the prompt the model received.
async function runThroughSdk(
  messages: Parameters<typeof generateText>[0]['messages'],
): Promise<LanguageModelV4CallOptions['prompt']> {
  const model = recordingModel();
  await generateText({
    model,
    messages,
    // The single line the G155 fix added to each text handler. Without it the
    // real `standardizePrompt` throws InvalidPromptError on the system message.
    allowSystemInMessages: true,
  });
  return model.doGenerateCalls[0].prompt;
}

const SYSTEM_TEXT = 'You are terse. Answer in one word.';

describe('system prompts survive the real AI SDK pipeline on every text route', () => {
  // G155 — chat: a `role: 'system'` message in `messages` must reach the model
  // through the real standardizePrompt, not throw InvalidPromptError.
  it('chat: toModelMessages system message reaches the model prompt without throwing', async () => {
    const messages = chatToModelMessages([
      { role: 'system', content: SYSTEM_TEXT },
      { role: 'user', content: 'hi' },
    ] as OpenAIMessage[]);

    // Sanity: the translator does produce a system-role message (the shape
    // that ai@7 rejects by default).
    expect(messages.some((m) => m.role === 'system')).toBe(true);

    const prompt = await runThroughSdk(messages);
    const systemEntry = prompt.find((m) => m.role === 'system');
    expect(systemEntry, 'system content must survive to the model prompt').toBeDefined();
    expect(JSON.stringify(systemEntry)).toContain(SYSTEM_TEXT);
  });

  // G155 — messages: the top-level Anthropic `system` param folds into a
  // `role: 'system'` message; same rename hazard.
  it('messages: top-level system param reaches the model prompt without throwing', async () => {
    const messages = messagesToModelMessages({
      messages: [{ role: 'user', content: 'hi' }] as AnthropicMessage[],
      system: SYSTEM_TEXT,
    });

    expect(messages.some((m) => m.role === 'system')).toBe(true);

    const prompt = await runThroughSdk(messages);
    const systemEntry = prompt.find((m) => m.role === 'system');
    expect(systemEntry, 'system content must survive to the model prompt').toBeDefined();
    expect(JSON.stringify(systemEntry)).toContain(SYSTEM_TEXT);
  });

  // G155 — responses: `developer`/`system` input roles map to `role: 'system'`
  // messages; same rename hazard.
  it('responses: developer/system input reaches the model prompt without throwing', async () => {
    const messages = responsesToModelMessages([
      { role: 'system', content: SYSTEM_TEXT },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    ] as ResponsesRequest['input']);

    expect(messages.some((m) => m.role === 'system')).toBe(true);

    const prompt = await runThroughSdk(messages);
    const systemEntry = prompt.find((m) => m.role === 'system');
    expect(systemEntry, 'system content must survive to the model prompt').toBeDefined();
    expect(JSON.stringify(systemEntry)).toContain(SYSTEM_TEXT);
  });
});

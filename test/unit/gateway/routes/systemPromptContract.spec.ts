import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import type { OpenAIMessage } from '../../../../packages/gateway/src/routes/chatCompletions/translators/index.js';
import { toModelMessages as chatToModelMessages } from '../../../../packages/gateway/src/routes/chatCompletions/translators/index.js';
import type { AnthropicMessage } from '../../../../packages/gateway/src/routes/messages/translators/index.js';
import { toModelMessages as messagesToModelMessages } from '../../../../packages/gateway/src/routes/messages/translators/index.js';
import type { ResponsesRequest } from '../../../../packages/gateway/src/routes/responses/schema.js';
import { toModelMessages as responsesToModelMessages } from '../../../../packages/gateway/src/routes/responses/translators/index.js';
import { generateResult, v4Usage } from './mockModels.js';

function recordingModel() {
  return new MockLanguageModelV4({
    doGenerate: () => Promise.resolve(generateResult({ usage: v4Usage(5, 2) })),
  });
}

async function runThroughSdk(
  messages: ModelMessage[],
): Promise<LanguageModelV4CallOptions['prompt']> {
  const model = recordingModel();

  await generateText({
    model,
    messages,
    allowSystemInMessages: true,
  });

  return model.doGenerateCalls[0].prompt;
}

const SYSTEM_TEXT = 'You are terse. Answer in one word.';

describe('system prompts survive the real AI SDK pipeline on every text route', () => {
  it('chat: toModelMessages system message reaches the model prompt without throwing', async () => {
    const messages = chatToModelMessages([
      { role: 'system', content: SYSTEM_TEXT },
      { role: 'user', content: 'hi' },
    ] as OpenAIMessage[]);

    expect(messages.some((m) => m.role === 'system')).toBe(true);

    const prompt = await runThroughSdk(messages);
    const systemEntry = prompt.find((m) => m.role === 'system');

    expect(systemEntry, 'system content must survive to the model prompt').toBeDefined();
    expect(JSON.stringify(systemEntry)).toContain(SYSTEM_TEXT);
  });

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

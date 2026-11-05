import type { ModelMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  CompactionError,
  summarize,
  SUMMARY_SHORTENED,
  toolPartsAsText,
} from '../../../../../packages/frogbot/src/chat/compaction/summarize.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

type Reply = { text: string; usage: { inputTokens?: number; outputTokens?: number } };

function fakeRequest(...replies: Reply[]) {
  const generateText = vi.fn((_opts: { messages: ModelMessage[]; maxOutputTokens?: number }) =>
    Promise.resolve(replies.shift() ?? { text: '', usage: {} }),
  );

  return { req: { frogbot: { generateText } } as unknown as FrogBotRequest, generateText };
}

const messages: ModelMessage[] = [{ role: 'user', content: 'Tell me about frogs.' }];

function section(index: number, chars: number) {
  return `## Important Context\n- Fact ${index}: ${'x'.repeat(chars)}`;
}

describe('summarize', () => {
  it('cuts a reply over 32,000 tokens at a heading within 128,000 characters', async () => {
    const text = Array.from({ length: 16 }, (_, index) => section(index, 9_970)).join('\n\n');
    const { req } = fakeRequest({ text, usage: { inputTokens: 900, outputTokens: 40_000 } });

    const summary = await summarize({ req, model: 'openai/gpt-5', messages, update: false });

    expect(text.length).toBeGreaterThan(128_000);
    expect(summary.text.length).toBeLessThanOrEqual(128_000);
    expect(summary.text.endsWith(`\n\n${SUMMARY_SHORTENED}`)).toBe(true);
    expect(text.startsWith(summary.text.slice(0, -SUMMARY_SHORTENED.length - 2))).toBe(true);
    expect(text.slice(summary.text.length - SUMMARY_SHORTENED.length - 2)).toMatch(/^\n\n## /);
    expect(summary.tokens).toEqual({
      input: 900,
      output: Math.round(summary.text.length / 4),
    });
  });

  it('measures a reply without usage by its characters', async () => {
    const text = `${section(1, 200_000)}`;
    const { req } = fakeRequest({ text, usage: {} });

    const summary = await summarize({ req, model: 'openai/gpt-5', messages, update: false });

    expect(summary.text.length).toBeLessThanOrEqual(128_000);
    expect(summary.text.endsWith(SUMMARY_SHORTENED)).toBe(true);
  });

  it('keeps a reply under the cap as it is', async () => {
    const text = '## Objective\n- Frogs.';
    const { req, generateText } = fakeRequest({
      text,
      usage: { inputTokens: 20, outputTokens: 6 },
    });

    await expect(
      summarize({ req, model: 'openai/gpt-5', messages, update: false }),
    ).resolves.toEqual({ text, tokens: { input: 20, output: 6 } });

    const sent = generateText.mock.calls[0][0];

    expect(sent.maxOutputTokens).toBe(32_000);
    expect(sent.messages.slice(0, -1)).toEqual(messages);
    expect(sent.messages.at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining('Keep the whole summary under about 24,000 words.'),
    });
  });

  it('nudges once when the reply skips the template', async () => {
    const { req, generateText } = fakeRequest(
      { text: 'Frogs are great.', usage: { inputTokens: 10 } },
      { text: '## Objective\n- Frogs.', usage: { inputTokens: 12, outputTokens: 5 } },
    );

    const summary = await summarize({ req, model: 'openai/gpt-5', messages, update: true });

    expect(summary).toEqual({ text: '## Objective\n- Frogs.', tokens: { input: 22, output: 5 } });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[0][0].messages.at(-1)!.content).toContain(
      'Update the existing checkpoint',
    );
    expect(generateText.mock.calls[1][0].messages.at(-1)!.content).toContain(
      'did not fill in the required summary template',
    );
  });

  it('fails when the nudged reply still skips the template', async () => {
    const { req } = fakeRequest({ text: 'Frogs.', usage: {} }, { text: 'Still frogs.', usage: {} });

    await expect(
      summarize({ req, model: 'openai/gpt-5', messages, update: false }),
    ).rejects.toThrow(CompactionError);
  });

  it('fails on an empty reply', async () => {
    const { req } = fakeRequest({ text: '  ', usage: {} }, { text: '', usage: {} });

    await expect(
      summarize({ req, model: 'openai/gpt-5', messages, update: false }),
    ).rejects.toThrow('The model returned an empty summary.');
  });
});

describe('toolPartsAsText', () => {
  it('sends tool calls and results as text, since the summary request has no tools', async () => {
    const { req, generateText } = fakeRequest({ text: '## Objective\n- Frogs.', usage: {} });

    await summarize({
      req,
      model: 'amazon-bedrock/claude',
      messages: [
        { role: 'user', content: 'Look frogs up, then close T-1.' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Looking.' },
            { type: 'tool-call', toolCallId: 'c1', toolName: 'lookup', input: { topic: 'frogs' } },
            {
              type: 'tool-call',
              toolCallId: 'c2',
              toolName: 'close_ticket',
              input: { ticket: 'T-1' },
            },
            { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c2' },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              toolName: 'lookup',
              output: { type: 'json', value: { found: 'Tree frogs' } },
            },
            { type: 'tool-approval-response', approvalId: 'a1', approved: false },
            {
              type: 'tool-result',
              toolCallId: 'c2',
              toolName: 'close_ticket',
              output: { type: 'execution-denied', reason: 'Keep it open.' },
            },
          ],
        },
      ],
      update: false,
    });

    expect(generateText.mock.calls[0][0].messages.slice(0, -1)).toEqual([
      { role: 'user', content: 'Look frogs up, then close T-1.' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Looking.' },
          { type: 'text', text: '[Tool call lookup: {"topic":"frogs"}]' },
          { type: 'text', text: '[Tool call close_ticket: {"ticket":"T-1"}]' },
        ],
      },
      {
        role: 'user',
        content:
          '[Tool result lookup: {"found":"Tree frogs"}]\n\n[Tool result close_ticket: Denied: Keep it open.]',
      },
    ]);
  });

  it('drops a message that held only approval parts', () => {
    expect(
      toolPartsAsText([
        {
          role: 'assistant',
          content: [{ type: 'tool-approval-request', approvalId: 'a1', toolCallId: 'c1' }],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-approval-response', approvalId: 'a1', approved: true }],
        },
      ]),
    ).toEqual([]);
  });
});

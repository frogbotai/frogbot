import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  describeMessagesError,
  validateChatMessages,
} from '../../../../packages/frogbot/src/chat/validateMessages.js';

function withReference(extra: Record<string, unknown>) {
  return [
    {
      id: 'm1',
      role: 'user',
      parts: [
        {
          type: 'file-reference',
          id: 1,
          filename: 'Pasted text',
          mediaType: 'text/plain',
          ...extra,
        },
        { type: 'text', text: 'Summarize this' },
      ],
    },
  ];
}

describe('validateChatMessages', () => {
  it('keeps the paste origin on file references', async () => {
    const [message] = await validateChatMessages(withReference({ origin: 'paste' }));

    expect(message?.parts[0]).toEqual({
      type: 'file-reference',
      id: 1,
      filename: 'Pasted text',
      mediaType: 'text/plain',
      origin: 'paste',
    });
  });

  it('accepts a message that holds only a file reference', async () => {
    const reference = {
      type: 'file-reference',
      id: 2,
      filename: 'photo.png',
      mediaType: 'image/png',
    };

    const [message] = await validateChatMessages([{ id: 'm2', role: 'user', parts: [reference] }]);

    expect(message?.parts).toEqual([reference]);
  });

  it('rejects any other file reference origin', async () => {
    await expect(validateChatMessages(withReference({ origin: 'upload' }))).rejects.toThrow();
  });
});

describe('describeMessagesError', () => {
  async function explain(messages: unknown[], tools?: Parameters<typeof validateChatMessages>[1]) {
    const error = await validateChatMessages(messages, tools).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    return describeMessagesError(error, messages);
  }

  const user = (part: Record<string, unknown>) => [{ id: 'm1', role: 'user', parts: [part] }];

  it('lists the part types for an unknown one', async () => {
    expect(await explain(user({ type: 'txt', text: 'Hi' }))).toBe(
      "`messages[0].parts[0].type`: expected one of 'text' | 'reasoning' | 'custom' | 'source-url' | 'source-document' | 'file' | 'reasoning-file' | 'step-start' | 'data-*' | 'dynamic-tool' | 'tool-*', received 'txt'",
    );
  });

  it('names a missing field once the part type matches', async () => {
    expect(await explain(user({ type: 'text' }))).toBe(
      '`messages[0].parts[0].text`: expected string, received undefined',
    );
  });

  it('lists the states for a tool part with an unknown one', async () => {
    expect(await explain(user({ type: 'tool-lookup', toolCallId: 'c1', state: 'done' }))).toBe(
      "`messages[0].parts[0].state`: expected one of 'input-streaming' | 'input-available' | 'approval-requested' | 'approval-responded' | 'output-available' | 'output-error' | 'output-denied', received 'done'",
    );
  });

  it('names the role, a file reference field and a tool input field', async () => {
    expect(await explain([{ id: 'm1', role: 'bot', parts: [{ type: 'text', text: 'Hi' }] }])).toBe(
      "`messages[0].role`: expected one of 'system' | 'user' | 'assistant', received 'bot'",
    );
    expect(
      await explain([
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
        { id: 'm2', role: 'user', parts: [{ type: 'file-reference', id: 1 }] },
      ]),
    ).toBe('`messages[1].parts[0].filename`: expected string, received undefined');
    expect(
      await explain(
        [
          {
            id: 'm1',
            role: 'assistant',
            parts: [
              { type: 'tool-lookup', toolCallId: 'c1', state: 'input-available', input: { id: 3 } },
            ],
          },
        ],
        { lookup: tool({ inputSchema: z.object({ id: z.string() }) }) },
      ),
    ).toBe('`messages[0].parts[0].input.id`: expected string, received number');
  });

  it('lists every option of a union of literals or types', async () => {
    expect(
      await explain(
        [
          {
            id: 'm1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-weather',
                toolCallId: 'c1',
                state: 'input-available',
                input: { unit: 'k' },
              },
            ],
          },
        ],
        {
          weather: tool({
            inputSchema: z.object({ unit: z.union([z.literal('c'), z.literal('f')]) }),
          }),
        },
      ),
    ).toBe("`messages[0].parts[0].input.unit`: expected one of 'c' | 'f', received 'k'");
    expect(await explain(withReference({ id: null }))).toBe(
      '`messages[0].parts[0].id`: expected one of string | number, received null',
    );
  });

  it('returns undefined for an error without issues', () => {
    expect(describeMessagesError(new Error('boom'), [])).toBeUndefined();
  });
});

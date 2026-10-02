import { describe, expect, it } from 'vitest';

import { validateChatMessages } from '../../../../packages/frogbot/src/chat/validateMessages.js';

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
    const [message] = await validateChatMessages(withReference({ origin: 'paste' }), {} as never);

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

    const [message] = await validateChatMessages(
      [{ id: 'm2', role: 'user', parts: [reference] }],
      {} as never,
    );

    expect(message?.parts).toEqual([reference]);
  });

  it('rejects any other file reference origin', async () => {
    await expect(
      validateChatMessages(withReference({ origin: 'upload' }), {} as never),
    ).rejects.toThrow();
  });
});

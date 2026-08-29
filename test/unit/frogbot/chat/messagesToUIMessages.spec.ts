import { describe, expect, it } from 'vitest';

import { messagesToUIMessages } from '../../../../packages/frogbot/src/chat/messagesToUIMessages.js';

describe('messagesToUIMessages', () => {
  it('preserves persisted tool, file, and metadata parts', () => {
    const parts = [
      { type: 'text', text: 'Result' },
      { type: 'file', mediaType: 'image/png', url: '/api/files/1' },
      { type: 'tool-search', toolCallId: 'call-1', state: 'output-available', output: {} },
    ] as never;

    expect(
      messagesToUIMessages([
        { id: 42, role: 'assistant', parts, metadata: { model: 'test' } },
        { id: 'empty-meta', role: 'user', parts: [], metadata: null },
      ]),
    ).toEqual([
      { id: '42', role: 'assistant', parts, metadata: { model: 'test' } },
      { id: 'empty-meta', role: 'user', parts: [] },
    ]);
  });
});

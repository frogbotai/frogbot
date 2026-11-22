import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  renderPinnedMemories,
  withRecalled,
} from '../../../../packages/frogbot/src/memory/prompt.js';
import type { Memory } from '../../../../packages/frogbot/src/memory/types.js';

const scopes = ['me', 'agent', 'team', 'client'];

function memory(id: string, scope: string, text: string, createdAt: string): Memory {
  return { id, scope, text, pinned: true, createdAt, updatedAt: createdAt };
}

const pinned = [
  memory('3', 'team', 'The office closes at six.', '2026-01-01T00:00:00.000Z'),
  memory('1', 'me', 'Call me Sam.', '2026-01-02T00:00:00.000Z'),
  memory('2', 'me', 'Prefers email.', '2026-01-01T00:00:00.000Z'),
  memory('4', 'client', 'Acme pays net 30.', '2025-12-01T00:00:00.000Z'),
];

describe('pinned memory prompt', () => {
  it('renders the same bytes for the same pinned set, whatever order the adapter returns', () => {
    const first = renderPinnedMemories({ memories: pinned, scopes });
    const second = renderPinnedMemories({ memories: [...pinned].reverse(), scopes });

    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    expect(first).toBe(
      [
        '## Memory',
        '',
        'You can save, search and forget memories. Scopes: me, agent, team, client.',
        '',
        'Pinned memories:',
        '- Prefers email.',
        '- Call me Sam.',
        '- The office closes at six.',
        '- Acme pays net 30.',
      ].join('\n'),
    );
  });

  it('drops whole memories past the 2,000-token budget', () => {
    const big = 'x'.repeat(4 * 1_998);
    const text = renderPinnedMemories({
      memories: [
        memory('1', 'me', big, '2026-01-01T00:00:00.000Z'),
        memory('2', 'me', 'Too late for the budget.', '2026-01-02T00:00:00.000Z'),
      ],
      scopes,
    });

    expect(text).toContain(`- ${big}`);
    expect(text).not.toContain('Too late');
  });

  it('lists the scopes without a pinned section when nothing is pinned', () => {
    expect(renderPinnedMemories({ memories: [], scopes: ['me', 'agent', 'team'] })).toBe(
      '## Memory\n\nYou can save, search and forget memories. Scopes: me, agent, team.',
    );
  });
});

describe('recalled memories', () => {
  const recalled: ModelMessage = { role: 'user', content: '<memories>\n- x\n</memories>' };

  it('goes right before the last user message, after the stable prefix', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'Instructions' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'What do I like?' },
      { role: 'assistant', content: 'Checking.' },
    ];

    expect(withRecalled(messages, recalled)).toEqual([
      ...messages.slice(0, 3),
      recalled,
      ...messages.slice(3),
    ]);
  });

  it('leaves the messages alone when nothing was recalled', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hi' }];

    expect(withRecalled(messages, undefined)).toBe(messages);
  });
});

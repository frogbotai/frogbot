import { describe, expect, it } from 'vitest';

import {
  CHAT_TURNS_SLUG,
  defaultChatTurnsCollection,
} from '../../../../../packages/frogbot/src/chat/collections/turns.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const collection = defaultChatTurnsCollection();

describe('defaultChatTurnsCollection', () => {
  it('is a hidden collection keyed by chat id', () => {
    expect(collection.slug).toBe(CHAT_TURNS_SLUG);
    expect(collection.admin).toEqual({ hidden: true });
    expect(collection.fields.find((f) => 'name' in f && f.name === 'id')).toMatchObject({
      type: 'text',
      required: true,
    });
  });

  it('stores an idle, running, or awaiting state with an attempt and lease', () => {
    expect(collection.fields.map((f) => ('name' in f ? f.name : undefined))).toEqual([
      'id',
      'state',
      'attempt',
      'leaseUntil',
    ]);
    expect(collection.fields.find((f) => 'name' in f && f.name === 'state')).toMatchObject({
      type: 'select',
      options: ['idle', 'running', 'awaiting'],
      required: true,
      defaultValue: 'idle',
    });
    expect(collection.fields.find((f) => 'name' in f && f.name === 'leaseUntil')).toMatchObject({
      type: 'date',
    });
  });

  it.each(['create', 'read', 'update', 'delete'] as const)(
    'denies %s through the API, even for authenticated users',
    async (operation) => {
      const req = { user: { id: 'u1' } } as FrogBotRequest;

      expect(await collection.access?.[operation]?.({ req } as never)).toBe(false);
    },
  );
});

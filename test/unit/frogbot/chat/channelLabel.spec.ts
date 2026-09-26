import { describe, expect, it } from 'vitest';

import { resolveChannelLabel } from '../../../../packages/frogbot/src/chat/channelLabel.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceInstance } from '../../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const slack = definePiece({ slug: 'slack', label: 'Slack', actions: [] });

const teams = definePiece({ slug: 'microsoft-teams', label: 'Microsoft Teams', actions: [] });

const chat = {
  channel: 'slack',
  channelKey: 'channel-key',
  channelThread: { account: 'support-workspace', thread: { id: 'thread-1' } },
} as Parameters<typeof resolveChannelLabel>[0]['chat'];

function reqWith(instances: PieceInstance[]) {
  return { frogbot: { config: { pieces: { instances } } } } as unknown as FrogBotRequest;
}

describe('resolveChannelLabel', () => {
  it('uses the label of the instance named by the chat’s account', () => {
    const req = reqWith([slack({ slug: 'other-workspace' }), teams({ slug: 'support-workspace' })]);

    expect(resolveChannelLabel({ req, chat })).toBe('Microsoft Teams');
  });

  it('falls back to a piece matching the stored channel', () => {
    expect(resolveChannelLabel({ req: reqWith([slack({ slug: 'other' })]), chat })).toBe('Slack');
  });

  it('falls back to the stored channel when its piece is not installed', () => {
    expect(resolveChannelLabel({ req: reqWith([]), chat })).toBe('slack');
  });

  it('returns null for a web chat', () => {
    expect(resolveChannelLabel({ req: reqWith([slack({ slug: 'slack' })]), chat: {} })).toBeNull();
  });
});

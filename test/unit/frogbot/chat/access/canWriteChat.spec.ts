import { NotFound } from 'payload';
import { describe, expect, it } from 'vitest';

import type { WritableChat } from '../../../../../packages/frogbot/src/chat/access/canWriteChat.js';
import {
  assertCanWriteChat,
  canWriteChat,
} from '../../../../../packages/frogbot/src/chat/access/canWriteChat.js';
import { definePiece } from '../../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceInstance } from '../../../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

const slack = definePiece({ slug: 'slack', label: 'Slack', actions: [] });

const channelChat: WritableChat = {
  user: 'owner',
  channel: 'slack',
  channelKey: 'channel-key',
  channelThread: {
    account: 'slack-support',
    thread: { id: 'slack:C1:1' } as NonNullable<WritableChat['channelThread']>['thread'],
  },
};

const webChat: WritableChat = { user: 'owner' };

function makeReq({
  user = 'owner',
  channel,
  instances = [],
}: {
  user?: string | null;
  channel?: { piece: string; threadId: string };
  instances?: PieceInstance[];
} = {}) {
  return {
    user: user === null ? null : { id: user },
    context: channel ? { channel: { ...channel, author: { id: 'U1' } } } : {},
    frogbot: { config: { pieces: { instances } } },
  } as unknown as FrogBotRequest;
}

describe('canWriteChat', () => {
  it('allows the owner to write a web chat', () => {
    expect(canWriteChat({ req: makeReq(), chat: webChat })).toBe(true);
  });

  it('refuses another user writing a web chat', () => {
    expect(canWriteChat({ req: makeReq({ user: 'stranger' }), chat: webChat })).toBe(false);
  });

  it('allows an anonymous caller to write an ownerless web chat', () => {
    expect(canWriteChat({ req: makeReq({ user: null }), chat: { user: null } })).toBe(true);
  });

  it('allows a request from the chat’s own channel thread', () => {
    const req = makeReq({ user: null, channel: { piece: 'slack', threadId: 'slack:C1:1' } });

    expect(canWriteChat({ req, chat: channelChat })).toBe(true);
  });

  it.each([
    ['without channel context', undefined],
    ['from another thread', { piece: 'slack', threadId: 'slack:C1:2' }],
    ['from another piece', { piece: 'discord', threadId: 'slack:C1:1' }],
  ])('refuses the chat owner writing a channel chat %s', (_, channel) => {
    expect(canWriteChat({ req: makeReq({ channel }), chat: channelChat })).toBe(false);
  });

  it('refuses a channel chat whose thread reference is missing', () => {
    const req = makeReq({ channel: { piece: 'slack', threadId: 'slack:C1:1' } });

    expect(canWriteChat({ req, chat: { ...channelChat, channelThread: null } })).toBe(false);
  });
});

describe('assertCanWriteChat', () => {
  it('refuses a channel chat with channel-chat naming the piece', () => {
    const req = makeReq({ instances: [slack({ slug: 'slack-support' })] });

    expect(() => assertCanWriteChat({ req, chat: channelChat })).toThrow(
      expect.objectContaining({
        code: 'channel-chat',
        status: 409,
        message:
          'This conversation happens in Slack. Continue it there, or branch it into a new chat.',
      }),
    );
  });

  it('names the piece when the chat’s account is no longer configured', () => {
    const req = makeReq({ instances: [slack({ slug: 'slack-other' })] });

    expect(() => assertCanWriteChat({ req, chat: channelChat })).toThrow(
      'This conversation happens in Slack.',
    );
  });

  it('falls back to the stored channel when its piece is not installed', () => {
    expect(() => assertCanWriteChat({ req: makeReq(), chat: channelChat })).toThrow(
      'This conversation happens in slack.',
    );
  });

  it('hides another user’s web chat as not found', () => {
    expect(() => assertCanWriteChat({ req: makeReq({ user: 'stranger' }), chat: webChat })).toThrow(
      NotFound,
    );
  });
});

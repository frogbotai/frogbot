import { describe, expect, it, vi } from 'vitest';

import {
  channelConversationKey,
  resolveChannelChat,
} from '../../../../packages/frogbot/src/channels/conversation.js';
import type { ChannelConversationIdentity } from '../../../../packages/frogbot/src/channels/types.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';

const identity: ChannelConversationIdentity = {
  agent: 'support',
  piece: 'slack',
  account: 'workspace-1',
  kind: 'channel',
  peer: 'C123',
  parent: '1710000000.000001',
  thread: '1710000000.000002',
};

function request({
  create = vi.fn(() => Promise.resolve({ id: 'chat-1' })),
  find = vi.fn(() => Promise.resolve({ docs: [] })),
}: {
  create?: ReturnType<typeof vi.fn>;
  find?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    req: {
      frogbot: {
        config: { chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' } },
        create,
        find,
      },
    } as unknown as FrogbotRequest,
    create,
    find,
  };
}

describe('channel conversations', () => {
  it('derives a stable key from every routing dimension', () => {
    const key = channelConversationKey(identity);

    expect(channelConversationKey({ ...identity })).toBe(key);
    expect(channelConversationKey({ ...identity, peer: 'C456' })).not.toBe(key);
    expect(channelConversationKey({ ...identity, thread: '1710000000.000003' })).not.toBe(key);
  });

  it('reuses an existing external conversation', async () => {
    const find = vi.fn(() => Promise.resolve({ docs: [{ id: 'existing' }] }));
    const { req, create } = request({ find });

    await expect(resolveChannelChat({ req, identity, user: null })).resolves.toBe('existing');
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a nullable-user chat with readable external fields', async () => {
    const { req, create } = request();
    const channelKey = channelConversationKey(identity);

    await expect(resolveChannelChat({ req, identity, user: null })).resolves.toBe('chat-1');
    expect(create).toHaveBeenCalledWith({
      collection: 'chats',
      data: {
        user: null,
        agent: 'support',
        channel: 'slack',
        externalId: '1710000000.000002',
        channelKey,
      },
      req,
      overrideAccess: true,
    });
  });

  it('resolves a concurrent unique create race to its winner', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 'winner' }] });
    const create = vi.fn(() => Promise.reject(new Error('unique violation')));
    const { req } = request({ create, find });

    await expect(resolveChannelChat({ req, identity, user: 'user-1' })).resolves.toBe('winner');
  });

  it('does not hide unrelated create failures', async () => {
    const error = new Error('database unavailable');
    const find = vi.fn(() => Promise.resolve({ docs: [] }));
    const create = vi.fn(() => Promise.reject(error));
    const { req } = request({ create, find });

    await expect(resolveChannelChat({ req, identity, user: null })).rejects.toBe(error);
  });
});

import type { DocID } from '../collections/config/types.js';
import type { Endpoint } from '../endpoints/types.js';
import { frogbotError } from '../errors/catalog.js';
import type { FrogBotRequest } from '../types/request.js';
import { branchChat } from './branchChat.js';
import { compactChat } from './compaction/compactChat.js';
import { suggestChatTitleForChat } from './title.js';

export function buildChatEndpoints(): Endpoint[] {
  return [
    {
      path: '/frogbot/chat/branch',
      method: 'post',
      handler: async (req: FrogBotRequest) => {
        if (!req.user) throw frogbotError('auth.unauthenticated');
        const body = (await req.json?.().catch(() => null)) as {
          chatId?: DocID;
          messageId?: DocID;
        } | null;

        if (
          body === null ||
          !['string', 'number'].includes(typeof body.chatId) ||
          !['string', 'number'].includes(typeof body.messageId)
        ) {
          throw frogbotError('request.invalid', {
            detail: '`chatId` and `messageId` are required.',
            fields: [
              { path: 'chatId', message: 'is required' },
              { path: 'messageId', message: 'is required' },
            ],
          });
        }

        return Response.json(
          await branchChat({ req, chatId: body.chatId!, messageId: body.messageId! }),
        );
      },
    },
    {
      path: '/frogbot/chat/compact',
      method: 'post',
      handler: async (req: FrogBotRequest) => {
        if (!req.user) throw frogbotError('auth.unauthenticated');
        const body = (await req.json?.().catch(() => null)) as { chatId?: DocID } | null;
        if (body === null || !['string', 'number'].includes(typeof body.chatId)) {
          throw chatIdRequired();
        }

        return Response.json(await compactChat({ req, chatId: body.chatId! }));
      },
    },
    {
      path: '/frogbot/chat/suggest-title',
      method: 'post',
      handler: async (req: FrogBotRequest) => {
        if (!req.user) throw frogbotError('auth.unauthenticated');
        const body = (await req.json?.().catch(() => null)) as { chatId?: DocID } | null;
        if (body === null || !['string', 'number'].includes(typeof body.chatId)) {
          throw chatIdRequired();
        }

        const suggestion = await suggestChatTitleForChat({ req, chatId: body.chatId! });

        return Response.json({ suggestion: suggestion ?? null });
      },
    },
  ];
}

function chatIdRequired() {
  return frogbotError('request.invalid', {
    detail: '`chatId` is required.',
    fields: [{ path: 'chatId', message: 'is required' }],
  });
}

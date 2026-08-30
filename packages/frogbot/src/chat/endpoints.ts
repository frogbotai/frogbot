import type { DocID } from '../collections/config/types.js';
import type { Endpoint } from '../endpoints/types.js';
import type { FrogbotRequest } from '../types/request.js';
import { branchChat } from './branchChat.js';
import { suggestChatTitleForChat } from './title.js';

export function buildChatEndpoints(): Endpoint[] {
  return [
    {
      path: '/frogbot/chat/branch',
      method: 'post',
      handler: async (req: FrogbotRequest) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const body = (await req.json?.().catch(() => null)) as {
          chatId?: DocID;
          messageId?: DocID;
        } | null;
        if (
          body === null ||
          !['string', 'number'].includes(typeof body.chatId) ||
          !['string', 'number'].includes(typeof body.messageId)
        ) {
          return Response.json({ error: 'chatId and messageId are required' }, { status: 400 });
        }
        return Response.json(
          await branchChat({ req, chatId: body.chatId!, messageId: body.messageId! }),
        );
      },
    },
    {
      path: '/frogbot/chat/suggest-title',
      method: 'post',
      handler: async (req: FrogbotRequest) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const body = (await req.json?.().catch(() => null)) as { chatId?: DocID } | null;
        if (body === null || !['string', 'number'].includes(typeof body.chatId)) {
          return Response.json({ error: 'chatId is required' }, { status: 400 });
        }
        const suggestion = await suggestChatTitleForChat({ req, chatId: body.chatId! });
        return Response.json({ suggestion: suggestion ?? null });
      },
    },
  ];
}

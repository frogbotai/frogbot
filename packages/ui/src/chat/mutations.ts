import type { FrogBotSDK } from '@frogbotai/sdk';

import type { MessageDocument } from './messages';
import { chatRequest, type PayloadPage } from './rest';
import { emitChatMutation, type ChatDocument } from './use-chats';

type ChatMutationOptions = {
  sdk: FrogBotSDK;
  chatsSlug: string;
  chatId: string | number;
};

export async function branchChat(
  { sdk, chatId }: Pick<ChatMutationOptions, 'sdk' | 'chatId'>,
  messageId: string | number,
): Promise<string | number> {
  const result = await chatRequest<{ chatId: string | number }>(sdk, '/frogbot/chat/branch', {
    method: 'POST',
    body: JSON.stringify({ chatId, messageId }),
    headers: { 'Content-Type': 'application/json' },
  });
  emitChatMutation();
  return result.chatId;
}

export async function renameChat(
  { sdk, chatsSlug, chatId }: ChatMutationOptions,
  title: string,
): Promise<ChatDocument> {
  const chat = await chatRequest<ChatDocument>(
    sdk,
    `/${encodeURIComponent(chatsSlug)}/${encodeURIComponent(String(chatId))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ title }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
  emitChatMutation();
  return chat;
}

export async function updateChatAgent(
  { sdk, chatsSlug, chatId }: ChatMutationOptions,
  agent: string,
): Promise<ChatDocument> {
  const chat = await chatRequest<ChatDocument>(
    sdk,
    `/${encodeURIComponent(chatsSlug)}/${encodeURIComponent(String(chatId))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ agent }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
  emitChatMutation();
  return chat;
}

export async function deleteChat({
  sdk,
  chatsSlug,
  messagesSlug,
  chatId,
}: ChatMutationOptions & { messagesSlug: string }): Promise<void> {
  const params = new URLSearchParams({
    depth: '0',
    limit: '0',
    'where[chat][equals]': String(chatId),
  });
  const messages = await chatRequest<PayloadPage<MessageDocument>>(
    sdk,
    `/${encodeURIComponent(messagesSlug)}?${params}`,
  );
  await Promise.all(
    messages.docs.map((message) =>
      chatRequest(
        sdk,
        `/${encodeURIComponent(messagesSlug)}/${encodeURIComponent(String(message.id))}`,
        { method: 'DELETE' },
      ),
    ),
  );
  await chatRequest(
    sdk,
    `/${encodeURIComponent(chatsSlug)}/${encodeURIComponent(String(chatId))}`,
    { method: 'DELETE' },
  );
  emitChatMutation();
}

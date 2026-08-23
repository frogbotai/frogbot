import type { FrogBotSDK } from '@frogbotai/sdk';

import type { MessageDocument } from './messages';
import { chatRequest, type PayloadPage } from './rest';
import type { ChatDocument } from './use-chats';

type ChatMutationOptions = {
  sdk: FrogBotSDK;
  chatsSlug: string;
  chatId: string | number;
};

export function renameChat(
  { sdk, chatsSlug, chatId }: ChatMutationOptions,
  title: string,
): Promise<ChatDocument> {
  return chatRequest(
    sdk,
    `/${encodeURIComponent(chatsSlug)}/${encodeURIComponent(String(chatId))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ title }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
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
}

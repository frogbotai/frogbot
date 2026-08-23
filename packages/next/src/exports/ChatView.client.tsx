'use client';

import { Chat, ChatProvider, cookieFetch } from '@frogbotai/ui/chat';
import type { UIMessage } from 'frogbot';
import { useRef } from 'react';

const adapter = { fetch: cookieFetch() };

export type ChatViewClientProps = {
  agent: string;
  chatId?: string | number;
  documentPath: string;
  initialMessages: UIMessage[];
};

export function ChatViewClient({ agent, chatId, documentPath, initialMessages }: ChatViewClientProps) {
  const replaced = useRef(false);
  const onChatIdChange = (nextChatId: string | number | undefined) => {
    if (chatId !== undefined || nextChatId === undefined || replaced.current) return;
    replaced.current = true;
    window.history.replaceState(
      window.history.state,
      '',
      `${documentPath}/${encodeURIComponent(String(nextChatId))}`,
    );
  };

  return (
    <ChatProvider adapter={adapter}>
      <Chat
        agent={agent}
        {...(chatId === undefined ? {} : { chatId })}
        initialMessages={initialMessages}
        onChatIdChange={onChatIdChange}
      />
    </ChatProvider>
  );
}

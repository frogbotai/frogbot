'use client';

import { Chat, ChatHistory, ChatProvider, cookieFetch } from '@frogbotai/ui/chat';
import { useState } from 'react';

const adapter = { fetch: cookieFetch() };

export function SupportChat() {
  return (
    <ChatProvider adapter={adapter}>
      <div style={{ height: '100dvh' }}>
        <Chat agent="support" />
      </div>
    </ChatProvider>
  );
}

export function ControlledChat() {
  const [chatId, setChatId] = useState<string | number>();

  return (
    <ChatProvider adapter={adapter}>
      <Chat agent="support" chatId={chatId} onChatIdChange={setChatId} />
    </ChatProvider>
  );
}

export function SidebarChat() {
  return (
    <ChatProvider adapter={adapter}>
      <Chat
        agent="support"
        renderSidebar={({ chats, activeChatId, selectChat }) => (
          <ChatHistory
            chats={chats}
            activeChatId={activeChatId}
            fallbackTitle="New chat"
            onChatChange={selectChat}
          />
        )}
      />
    </ChatProvider>
  );
}

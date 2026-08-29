'use client';

import { ChatHistory } from '@frogbotai/ui/chat';
import { ThemeProvider } from '@frogbotai/ui/theme';
import { useTheme } from '@payloadcms/ui';
import { useRouter } from 'next/navigation';

export type ChatListItem = {
  id: string | number;
  title?: string | null;
  agent: string;
  lastMessageAt?: string | null;
};

export type ChatListProps = {
  chats: ChatListItem[];
  collectionSlug: string;
};

export function ChatList({ chats, collectionSlug }: ChatListProps) {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <div className="frogbot-chat-view">
      <ThemeProvider mode={theme}>
        <ChatHistory
          chats={chats}
          fallbackTitle="Untitled Chat"
          onChatChange={(id) =>
            router.push(
              `/admin/collections/${encodeURIComponent(collectionSlug)}/${encodeURIComponent(String(id))}`,
            )
          }
        />
      </ThemeProvider>
    </div>
  );
}

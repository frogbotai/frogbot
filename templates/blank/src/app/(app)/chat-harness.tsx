'use client';

import { Chat, ChatProvider, cookieFetch } from '@frogbotai/ui/chat';
import { ThemeProvider, ThemeScript } from '@frogbotai/ui/theme';

const adapter = { fetch: cookieFetch() };

export function ChatHarness() {
  return (
    <>
      <ThemeScript />
      <ThemeProvider>
        <ChatProvider adapter={adapter}>
          <main style={{ height: '100dvh' }}>
            <Chat agent="assistant" loadingContent="Loading chat" />
          </main>
        </ChatProvider>
      </ThemeProvider>
    </>
  );
}

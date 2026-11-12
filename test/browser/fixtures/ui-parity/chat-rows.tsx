import { createRoot } from 'react-dom/client';

import type { ChatDocument, ChatPlatformAdapter } from '../../../../packages/ui/src/chat/adapter';
import { ChatHistory } from '../../../../packages/ui/src/chat/chat-history';
import {
  NavAdapterProvider,
  NavSection,
  NavShell,
  RecentChats,
} from '../../../../packages/ui/src/index';
import { ThemeProvider } from '../../../../packages/ui/src/theme/provider';

const chats: ChatDocument[] = [
  { id: 1, title: 'Domain inventory cleanup plan', lastMessageAt: new Date().toISOString() },
  { id: 2, title: 'Pond survey', lastMessageAt: new Date().toISOString() },
] as ChatDocument[];

const unused = () => Promise.reject(new Error('not used'));

const adapter = {
  loadManifest: () => Promise.resolve(null),
  createTransport: () => {
    throw new Error('not used');
  },
  listChats: () =>
    Promise.resolve({
      docs: chats,
      page: 1,
      totalDocs: chats.length,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    }),
  getChat: unused,
  loadMessages: unused,
  renameChat: unused,
  deleteChat: unused,
} as ChatPlatformAdapter;

const preferences = { get: () => Promise.resolve(undefined as never), set: () => undefined };

function Page() {
  return (
    <NavAdapterProvider
      Link={({ children, ...props }) => <a {...props}>{children}</a>}
      navigate={() => undefined}
      pathname="/chat"
      preferences={preferences}
    >
      <div id="g" style={{ display: 'flex', minHeight: '100vh' }}>
        <NavShell
          accountName="Ada Lovelace"
          accountPath="/account"
          homePath="/chat"
          navItems={[{ label: 'Chat', path: '/chat', icon: 'bubble-chat' }]}
          sections={
            <NavSection id="recents" title="Recents">
              <RecentChats
                adapter={adapter}
                chatPath={(id) => `/chat/${id}`}
                recents={chats}
                viewAllPath="/chat"
              />
            </NavSection>
          }
          settingsPath="/settings"
        />
        <main id="chats-page" style={{ flex: 1, overflow: 'hidden', padding: 16 }}>
          <ChatHistory
            adapter={adapter}
            chats={chats}
            fallbackTitle="Untitled"
            onChatChange={() => undefined}
          />
        </main>
      </div>
    </NavAdapterProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider mode={document.documentElement.dataset.galleryTheme === 'dark' ? 'dark' : 'light'}>
    <Page />
  </ThemeProvider>,
);

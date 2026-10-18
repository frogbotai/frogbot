import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  NavAdapterProvider,
  NavItem,
  type NavLinkProps,
  NavSection,
  NavShell,
  useNavAdapter,
} from '../../../../packages/ui/src/index';
import { ThemeProvider } from '../../../../packages/ui/src/theme/provider';

const saved = new Map<string, unknown>();

const preferences = {
  get: (key: string) => Promise.resolve(saved.get(key) as never),
  set: (key: string, value: unknown) => {
    saved.set(key, value);
    document.getElementById('saved')!.textContent = JSON.stringify([...saved]);
  },
};

function PageLink({ children, href, ...props }: NavLinkProps) {
  const { navigate } = useNavAdapter();

  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function Page() {
  const [path, setPath] = useState('/chat');

  return (
    <NavAdapterProvider
      Link={PageLink}
      navigate={setPath}
      pathname={path}
      preferences={preferences}
    >
      <div id="g" style={{ display: 'flex', minHeight: '100vh' }}>
        <NavShell
          accountName="Ada Lovelace"
          accountPath="/account"
          homePath="/chat"
          navItems={[
            { label: 'Chat', path: '/chat', icon: 'bubble-chat' },
            { label: 'Providers', path: '/providers', icon: 'key-round' },
          ]}
          sections={
            <NavSection id="recents" title="Recents">
              <NavItem active={path === '/chat/1'} label="Tree frogs" path="/chat/1" />
              <NavItem active={path === '/chat/2'} label="Pond survey" path="/chat/2" />
            </NavSection>
          }
          settingsPath="/settings"
        />
        <main style={{ flex: 1 }}>
          <p id="path">{path}</p>
          <p id="saved" />
          <button type="button">After the nav</button>
        </main>
      </div>
    </NavAdapterProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider mode="light">
    <Page />
  </ThemeProvider>,
);

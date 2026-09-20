# Chat UI

Docs: https://docs.frogbot.ai/chat/ui-installation, https://docs.frogbot.ai/chat/ui-provider, https://docs.frogbot.ai/chat/ui-chat, and https://docs.frogbot.ai/chat/ui-theming

Use `@frogbotai/ui/chat` to render FrogBot chat in a React application. Chat components that use hooks, browser APIs, or event handlers belong in a client component.

## Install

```bash
pnpm add @frogbotai/ui ai @ai-sdk/react react react-dom
```

Load the package styles from the application's global stylesheet or root layout:

```ts
import '@frogbotai/ui/styles.css';
```

## Render chat

`Chat` must be a descendant of `ChatProvider`. Create the adapter outside the component so renders do not replace the provider value.

```tsx
'use client';

import { Chat, ChatProvider, cookieFetch } from '@frogbotai/ui/chat';

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
```

`cookieFetch()` uses the current browser session. Use `bearerFetch(token)` when the host authenticates with a bearer token. Do not expose server credentials in either adapter.

Keep components that call `useChatProvider()` under the same `ChatProvider`; adding a second provider creates a separate chat context.

## Control routing

Use `chatId` with `onChatIdChange` when the application owns the active route. Use `defaultChatId` for an internally managed initial selection.

```tsx
<Chat agent="support" chatId={chatId} onChatIdChange={setChatId} />
```

## Compose the shell

Use `headerSlot`, `composerStartSlot`, `composerEndSlot`, and `panel` to add application UI without replacing the chat state or transport. `renderSidebar` receives the provider-backed chat list and selection actions.

```tsx
import { Chat, ChatHistory } from '@frogbotai/ui/chat';

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
/>;
```

`AgentSelector` reads available agents from `ChatProvider`. `ModelSelector` and `ToolSelector` only manage caller-supplied client state; they do not change the server model or server tool access.

## Lower-level components

Import public primitives from `@frogbotai/ui/chat`, including `ChatShell`, `Composer`, `MessageList`, `Message`, `MessagePart`, `Markdown`, and `ToolPart`. Prefer `Chat` unless the application needs to own message loading, transport, and composition.

Register custom tool and artifact rendering through the public `@frogbotai/ui/chat/tools` and `@frogbotai/ui/chat/artifacts` entry points. Keep registrations in the client graph that renders the conversation.

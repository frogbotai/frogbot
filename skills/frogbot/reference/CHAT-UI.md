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

import { Chat, ChatProvider } from '@frogbotai/ui/chat';
import { cookieFetch, createRestChatAdapter } from '@frogbotai/ui/chat/rest';

const adapter = createRestChatAdapter({ fetch: cookieFetch() });

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

`createRestChatAdapter` connects the chat UI to a FrogBot server. `cookieFetch()` uses the current browser session. Use `bearerFetch(getToken)` when the host authenticates with a bearer token. Do not expose server credentials in either fetch.

A host without a FrogBot server passes its own `ChatPlatformAdapter`: `loadManifest`, `createTransport`, `listChats`, `getChat` and `loadMessages` are required, and each optional member, such as `renameChat`, `branchChat` or `uploadAttachment`, shows its feature only when present. The backend behind the transport stores each turn and calls `onChatId` for a new chat. See https://docs.frogbot.ai/chat/ui-provider#custom-adapter.

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

// `adapter` is the one passed to `ChatProvider`; it adds the rename and delete row actions.

<Chat
  agent="support"
  renderSidebar={({ chats, activeChatId, selectChat }) => (
    <ChatHistory
      chats={chats}
      activeChatId={activeChatId}
      fallbackTitle="New chat"
      onChatChange={selectChat}
      adapter={adapter}
    />
  )}
/>;
```

`dockSlot` puts cards above the composer; wrap them in `ChatDock` (`header`, body, `footer`) and set `dockBlocking` to hide the composer while they wait. A waiting client tool call with a registered renderer, such as `question`, docks there automatically and hides the composer until it is answered. The composer stays mounted, so its draft survives.

`onBeforeSubmit({ text })` runs before each send; return `true` to handle a typed command yourself (text clears, attachments stay). `ModelSelector` takes `open` and `onOpenChange` so a command can open it, and `matchesModelSearch`, `normalizeModelSearch` and `compactModelSearch` from `@frogbotai/ui/chat` match like its search.

`AgentSelector` reads available agents from `ChatProvider`. `ModelSelector` and `ToolSelector` only manage caller-supplied client state; they do not change the server model or server tool access.

## Lower-level components

Import public primitives from `@frogbotai/ui/chat`, including `ChatShell`, `Composer`, `MessageList`, `Message`, `MessagePart`, `Markdown`, and `ToolPart`. Prefer `Chat` unless the application needs to own message loading, transport, and composition.

Unregistered tools render as a closed row (name, input summary, status) that opens to the input and output, with MCP `{ type: 'image', data, mimeType }` content shown as images. Register `data-<kind>` part renderers with `ChatProvider dataRenderers={[{ kind, render }]}`; `CompactionPart` renders `data-compaction` (`CompactionPartData`) and is not registered by default.

Register custom tool and artifact rendering through the public `@frogbotai/ui/chat/tools` and `@frogbotai/ui/chat/artifacts` entry points. Keep registrations in the client graph that renders the conversation.

# Sub-Agent Architecture

## What is a sub-agent?

The desktop app's parent AI can delegate browser tasks to a separate "act" agent running inside the Chrome extension. The extension controls the browser (clicking, navigating, filling forms), streams its progress back to the desktop in real-time, and returns a summary when done.

## The mental model

```
Desktop app (parent AI)
  │
  │  "go click the login button"
  ▼
Server (routes the task over WebSocket)
  │
  ▼
Chrome extension (act agent runs here)
  │  streams AI chunks back as it thinks + acts
  ▼
Server (relays chunks back)
  │
  ▼
Desktop app (renders live progress in the UI)
```

The extension doesn't send a result at the end and call it done. It streams every AI SDK chunk back to the desktop so the UI can reconstruct the conversation in real-time — same as if the model were streaming directly to the desktop.

---

## End-to-end trace

> The example below traces Desktop → Extension. The same architecture supports other directions (Extension → Desktop, Web → Desktop, Web → Extension) — the routing is data-driven via `configOriginNode` and `from`/`to` in `activeTasks`.

Let's follow a single task: **"Click the login button"**.

### 1. Parent AI calls `sub_agent` tool

The desktop app is talking to a parent AI. That AI decides to delegate browser work and calls the `sub_agent` tool with:

```ts
{ agent: 'browser', instructions: 'Click the login button' }
```

Code: `packages/ai-chat/src/lib/tools/subAgent/tool.ts`

The tool's `execute()` calls the registered resolver for `'browser'`, which is a `RemoteResolver`.

### 2. Server sends `task:request` to the extension

The remote resolver calls `sendTask(userId, instructions, parentChatId, toolCallId)`, which is the function returned by `createSendTaskFn({ from: 'desktop', to: 'browser' })`.

This function:
1. Generates a `taskId`
2. Stores `{ resolve, timer, from: 'desktop', to: 'browser', userId }` in `activeTasks`
3. Emits `task:request` to the extension's socket room

Code: `apps/web/src/lib/ws/index.ts → createSendTaskFn()`

The `from: 'desktop'` is where it comes from. It's derived at the stream endpoint via `configOriginNode[config]`:

```ts
// packages/ai-chat/src/lib/types.ts
export const configOriginNode = {
  [ChatConfigsEnum.DESKTOP]: 'desktop',
  [ChatConfigsEnum.ACT]: 'browser',
  // ...
}
```

### 3. Extension runs `runSubAgent()`

The extension's background script receives `task:request` and calls `executeWSTask()`.

Code: `apps/extension/src/lib/wsTaskExecutor.ts`

It immediately calls `emitTaskStarted(taskId, chatId, toolCallId)` so the desktop UI can start rendering before the agent even begins.

Then it calls `runSubAgent()`:

```ts
// packages/ai-chat/src/lib/subAgent/run.ts
await runSubAgent({
  chatId,
  initialParts,          // Initial page state + task briefing
  metadata,              // actContext, parentChatId, etc.
  relay: (chunk) => emitTaskStream(taskId, chunk),  // ← streams back to desktop
  isClientTool: (name) => name in clientToolsMaps,
  onClientToolCall: (tc, addResult) => onClientToolCall(...),
})
```

`runSubAgent()` runs the agentic loop:
- Creates an `AgentClass` instance (the act agent)
- Sends the initial message
- On each `onToolCall`: executes the browser tool, calls `relay()` with a synthetic `tool-output-available` chunk so the desktop sees tool results too
- On `onFinish`: if there are more client-side tools pending, waits for them; otherwise kicks off a summary pass with `ACT_SUMMARY` config

### 4. Chunks stream back to the desktop

Each chunk from the extension travels:

```
extension: emitTaskStream(taskId, chunk)
  → server: socket.on('task:stream')
  → server: io.to(`${userId}:desktop`).emit('task:stream', data)
  → desktop: wsClient handler → taskStreamHandler.onTaskStream(taskId, chunk)
  → SubAgentTaskStore.onTaskStream()
  → written to the task's TransformStream writer
  → readUIMessageStream() reconstructs messages
  → React state update → UI re-renders
```

Code chain:
- `apps/extension/src/lib/wsClient.ts` → emits
- `apps/web/src/lib/ws/index.ts` → relays (looks up `task.from` in `activeTasks`)
- `apps/desktop/src/lib/wsClient.ts` → receives
- `apps/desktop/src/providers/SubAgentTaskStore.tsx` → reconstructs
- `packages/ai-chat/src/components/Message/Parts/ToolPart/SubAgentToolRender.tsx` → renders

### 5. Extension sends `task:result`

When `runSubAgent()` resolves, the extension calls `sendTaskResult(taskId, result)`.

The server:
1. Resolves the `resultPromise` — this unblocks the parent AI's tool `execute()` call
2. Relays `task:result` to the desktop room — so the UI transitions from "running" to "completed"

### 6. Parent AI continues

The resolved `SubAgentResult` flows back up through the resolver → tool → AI SDK, and the parent AI continues its conversation with the result in context.

---

## Key files

| File | What it does |
|------|-------------|
| `packages/ai-chat/src/lib/subAgent/run.ts` | The agentic loop. Use `runSubAgent()` to execute a browser task. |
| `packages/ai-chat/src/lib/subAgent/transport.ts` | Creates the HTTP transport. The `relay` wrapper tees the stream and forwards chunks. |
| `packages/ai-chat/src/providers/SubAgentTaskStore.tsx` | **Shared** task state store. Reconstructs message streams from chunks via `TransformStream`. |
| `packages/ai-chat/src/providers/SubAgentWSBridge.tsx` | **Shared** bridge component. Accepts a `SubAgentTransportAdapter` and wires it to the store + `SubAgentLiveContext`. |
| `packages/ai-chat/src/lib/fetchChatMessages.ts` | Shared helpers: `createFetchChatMessagesViaSDK()` and `createFetchChatMessagesViaHTTP()`. |
| `packages/core/src/wsClient.ts` | Shared WS client factory + protocol type definitions. |
| `apps/web/src/lib/ws/index.ts` | Server WS hub. Routes tasks, relays streams, resolves promises. |
| `apps/desktop/src/providers/SubAgentWSBridge.tsx` | Desktop adapter — bridges `setTaskStreamHandler` to the shared bridge. |
| `apps/web/src/providers/SubAgentWSBridge.tsx` | Web adapter — creates a cookie-auth WS client and bridges to the shared bridge. |
| `apps/extension/src/providers/SubAgentWSBridge.tsx` | Extension adapter — bridges `chrome.runtime.onMessage` to the shared bridge (MV3). |
| `apps/extension/src/lib/wsTaskExecutor.ts` | Entry point for extension-side task execution. |

---

## Cancellation

When the user hits stop:

```
desktop: emitTaskCancel(taskId)
  → server: relays task:cancel to extension's socket
  → extension: cancelWSTask(taskId) → abortController.abort()
  → runSubAgent: abort listener fires → chat.stop() → resolves with { success: false }
  → extension: sendTaskResult(taskId, { success: false, error: 'Task cancelled' })
```

`SubAgentWSBridge` registers the cancel function with `StreamProvider` on `task:started`, so the standard stop button in the desktop UI automatically cancels the right task.

---

## Extension ↔ Desktop: MV3 runtime nuance

Chrome extensions using Manifest V3 split execution across **two separate JS runtimes**:

- **Background service worker** — owns the WebSocket connection, receives `task:stream` / `task:result` events from the server.
- **Side panel (React UI)** — renders the chat, sub-agent progress, and cancel buttons.

These runtimes **do not share module-level state**. A module-scoped handler set in the background (e.g. `setTaskStreamHandler`) is invisible to the side panel, and vice versa.

### How we bridge them

1. **Background → Side panel**: when the background WS client receives `task:started`, `task:stream`, or `task:result`, it forwards the event via `chrome.runtime.sendMessage({ type, payload })`.
2. **Side panel → Background**: cancel requests go from the side panel to the background the same way (`chrome.runtime.sendMessage({ type: 'task:cancel', taskId })`), and the background emits `task:cancel` over the socket.
3. The side panel registers a `chrome.runtime.onMessage` listener that feeds events into the extension's `SubAgentTaskStore`, which reconstructs the message stream identically to the desktop store.

This is only necessary for the extension. The desktop app and web app each run in a single JS context, so they can wire WS events directly into their task store without a messaging bridge.

---

## Adding a new agent type

1. Add an entry to `ChatConfigsEnum` and `configOriginNode` in `packages/ai-chat/src/lib/types.ts`
2. Create a config factory in `packages/ai-chat/src/lib/configs/` (copy an existing one)
3. Register it in `packages/ai-chat/src/lib/configs/map.ts`
4. Wire a resolver in the config that calls `remoteResolvers.browser` or `remoteResolvers.desktop`

---

## Adding a new node (e.g. mobile app)

The sub-agent system uses a **transport adapter pattern** so adding a new node only requires implementing one small interface. All task store logic, stream reconstruction, and UI wiring are shared.

### 1. Implement `SubAgentTransportAdapter`

Each node's bridge implements this adapter (~15-20 lines):

```ts
// packages/ai-chat/src/providers/SubAgentWSBridge.tsx
type SubAgentTransportAdapter = {
  subscribe: (handlers: {
    onTaskStarted: (taskId: string, chatId: string, toolCallId?: string) => void
    onTaskStream: (taskId: string, chunk: UIMessageChunk) => void
    onTaskResult: (taskId: string, result: { chatId?: string; summary?: string }) => void
  }) => void
  cancelTask: (taskId: string) => void
  cleanup: () => void
}
```

For a mobile app using a direct WS client, the adapter would look like:

```tsx
const adapter = useMemo<SubAgentTransportAdapter>(() => {
  let activeHandlers: Parameters<SubAgentTransportAdapter['subscribe']>[0] | null = null

  const client = createWSClient({
    nodeType: 'mobile',
    getAuthToken: () => mobileAuth.getToken(),
    handlers: {
      'task:started': (d) => activeHandlers?.onTaskStarted(d.taskId, d.chatId, d.toolCallId),
      'task:stream': (d) => activeHandlers?.onTaskStream(d.taskId, d.chunk as UIMessageChunk),
      'task:result': ({ taskId, result }) => activeHandlers?.onTaskResult(taskId, {
        chatId: result.chatId,
        summary: result.result,
      }),
    },
  })
  client.connect()

  return {
    subscribe: (handlers) => { activeHandlers = handlers },
    cancelTask: (taskId) => client.emit('task:cancel', { taskId }),
    cleanup: () => client.disconnect(),
  }
}, [])
```

### 2. Create the node's bridge component

Wire the adapter into the shared `SubAgentWSBridge`:

```tsx
import {
  SubAgentWSBridge as SharedBridge,
  SubAgentTaskStoreProvider,
  createFetchChatMessagesViaSDK,  // or createFetchChatMessagesViaHTTP
} from '@firmware/ai-chat'

export const MobileSubAgentBridge = ({ children }) => {
  const { registerSubAgent, unregisterSubAgent } = useStream()
  const adapter = useMemo(() => { /* ... as above */ }, [])
  const fetchChatMessages = useCallback(createFetchChatMessagesViaSDK(sdk), [])

  return (
    <SharedBridge
      adapter={adapter}
      fetchChatMessages={fetchChatMessages}
      registerSubAgent={registerSubAgent}
      unregisterSubAgent={unregisterSubAgent}
    >
      {children}
    </SharedBridge>
  )
}
```

### 3. Register the node type on the server

In `apps/web/src/lib/ws/index.ts`, add the new node type to the socket room logic so the server knows how to route `task:request` / `task:stream` / `task:result` events to/from the new node.

### 4. Add the config mapping

In `packages/ai-chat/src/lib/types.ts`:
```ts
export const configOriginNode = {
  [ChatConfigsEnum.DESKTOP]: 'desktop',
  [ChatConfigsEnum.ACT]: 'browser',
  [ChatConfigsEnum.MOBILE]: 'mobile',  // ← new
}
```

That's it. The shared `SubAgentTaskStore`, stream reconstruction, `SubAgentLiveContext`, and `SubAgentToolRender` all work automatically.

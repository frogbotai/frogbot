# @frogbotai/protocol

The types-only contract shared by the [FrogBot](https://github.com/frogbotai/frogbot) server and its clients: turn states, turn error codes, the chat manifest, channel thread references and option colors.

It has no dependencies and no runtime code. `frogbot` and `@frogbotai/ui` both import these types, so a client can implement the chat contract without installing the server.

## Installation

```bash
pnpm add @frogbotai/protocol
```

## Usage

```ts
import type { ChatManifest, TurnState } from '@frogbotai/protocol';

export const idle: TurnState = 'idle';

export const manifest: ChatManifest = { defaultAgent: 'assistant', agents: [], transcribe: false };
```

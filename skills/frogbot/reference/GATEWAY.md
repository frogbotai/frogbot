# Gateway

Docs: https://docs.frogbot.ai/gateway/overview, https://docs.frogbot.ai/gateway/providers, and https://docs.frogbot.ai/gateway/configuration

`@frogbotai/gateway` exposes OpenAI-compatible and Anthropic-compatible HTTP routes backed by configured AI providers. Construct it only in server code because provider credentials and hooks execute there.

## Install

```bash
pnpm add @frogbotai/gateway
```

The package requires Node.js 22 or newer when using its Node server or CLI.

## Run the CLI

Built-in providers can be discovered from their standard environment variables.

```bash
OPENAI_API_KEY=sk-... npx @frogbotai/gateway
```

The default server listens on port `3939`. Use `--port`, `--config`, or `npx @frogbotai/gateway init` for an embedded server project.

## Configure providers

Use `defineConfig` in `gateway.config.ts`. Empty built-in provider objects read credentials from that provider's environment variables. Keep the file and its environment variables out of client bundles.

```ts
import { defineConfig } from '@frogbotai/gateway';

export default defineConfig({
  providers: {
    openai: {},
    anthropic: {},
    ollama: {
      baseURL: 'http://localhost:11434/v1',
    },
  },
});
```

Known provider keys use their provider-specific configuration. An unknown key is treated as an OpenAI-compatible provider and must include `baseURL`. Its key becomes the model prefix, such as `ollama/llama3.2`.

Model IDs use `<provider>/<model>`. Built-in models must be present in the gateway catalog. A built-in provider's `models` array can narrow its allowed catalog models.

## Embed the handler

`createGateway()` returns a WinterCG-compatible fetch handler. Mount that handler in a server route; do not import the gateway into a client component.

```ts
import { createGateway } from '@frogbotai/gateway';

const gateway = createGateway({
  providers: {
    openai: {},
  },
});

export const GET = gateway.handler;
export const POST = gateway.handler;
```

The full handler serves bare paths and paths under the default `/v1` base. It also exposes `routes` for selective mounting.

## Use from AI SDK server code

Resolve a configured model in process when an existing server call uses AI SDK directly:

```ts
import { generateText } from 'ai';
import { createGateway } from '@frogbotai/gateway';

const gateway = createGateway({
  providers: {
    openai: {},
  },
});

const result = await generateText({
  model: gateway.chatModel('openai/gpt-5'),
  prompt: 'Summarize the release notes.',
});
```

The model remains bound to the gateway's configured provider and hook lifecycle. Pass request-scoped values through the handler's second argument when mounting in an authenticated server:

```ts
gateway.handler(request, {
  context: {
    user,
  },
});
```

Only an in-process caller can seed this hook context; HTTP request bodies cannot set it.

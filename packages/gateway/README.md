<p align="center">
  <a href="https://www.frogbot.ai"><img src="https://raw.githubusercontent.com/frogbotai/frogbot/main/.github/assets/frogbot-logo.svg" width="110" alt="FrogBot logo" /></a>
</p>

<h1 align="center">@frogbotai/gateway</h1>

<p align="center"><strong>The open-source, self-hostable, embeddable AI gateway built on the Vercel AI SDK.</strong><br/>The server side of what Vercel kept closed-source — fully MIT licensed.</p>

<p align="center">
  <a href="https://github.com/frogbotai/frogbot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/@frogbotai/gateway"><img alt="npm" src="https://img.shields.io/npm/v/%40frogbotai%2Fgateway?style=flat-square" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/@frogbotai/gateway"><img alt="npm downloads" src="https://img.shields.io/npm/dw/%40frogbotai%2Fgateway?style=flat-square" /></a>
  &nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><img alt="Discord" src="https://img.shields.io/badge/Discord-join%20chat-5865F2?logo=discord&logoColor=white&style=flat-square" /></a>
  &nbsp;
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen?style=flat-square" />
</p>

<hr/>

<h4 align="center">
  <a href="https://docs.frogbot.ai"><strong>Explore the Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://discord.com/invite/JBZF7syAnU"><strong>Join the Discord</strong></a>
</h4>

<hr/>

One endpoint, every provider. Point any OpenAI-compatible client at the gateway and route to OpenAI, Anthropic, Google, Groq, Mistral, Bedrock, Vertex, and 30+ more providers — with streaming, hooks, and full OpenTelemetry observability. Run it standalone from the CLI, or embed it as a fetch handler inside any server you already have.

## Features

- **OpenAI-compatible wire formats** — Chat Completions, the Responses API, and Anthropic's Messages API, so existing SDKs and clients work unchanged
- **36+ built-in providers** plus generic OpenAI-compatible endpoints for anything self-hosted (vLLM, Ollama, LM Studio, ...)
- **Every modality** — chat, embeddings, images, speech, transcription, reranking, and video
- **Streaming everywhere** — SSE on chat completions, responses, and messages
- **Embeddable** — `createGateway()` returns a WinterCG fetch handler that mounts in Hono, Next.js, Bun, Deno, or Cloudflare Workers
- **Lifecycle hooks** — `beforeOperation` → `beforeUpstream` → `afterUpstream`/`afterError` → `afterOperation`, with token usage aggregated across tool loops
- **Observability built in** — structured logging (bring your own pino-compatible logger) and OpenTelemetry tracing
- **Wire-correct errors** — OpenAI's error envelope on every route; same-provider upstream errors forwarded verbatim with their original status
- **Fully MIT open source** — no gated features, no hosted tier required

## Quickstart

```bash
OPENAI_API_KEY=sk-... npx @frogbotai/gateway
```

The CLI auto-discovers providers from environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, ...) and listens on `0.0.0.0:3939` by default (`HOST` / `PORT` / `--port` to change). If no providers are found it exits with a friendly error listing every env var it looked for.

Model IDs are namespaced as `provider/model` — the prefix tells the gateway which provider to dispatch to.

### Use it with the OpenAI SDK

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'unused', // the gateway holds the upstream keys
  baseURL: 'http://localhost:3939/v1',
});

const res = await client.chat.completions.create({
  model: 'anthropic/claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});
```

### Or with `curl`

```bash
curl http://localhost:3939/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

## Endpoints

| Route | Compatibility | Streaming |
| --- | --- | --- |
| `POST /v1/chat/completions` | OpenAI Chat Completions | Yes |
| `POST /v1/responses` | OpenAI Responses API | Yes |
| `POST /v1/messages` | Anthropic Messages API | Yes |
| `POST /v1/embeddings` | OpenAI Embeddings | — |
| `POST /v1/images/generations` | OpenAI Images | — |
| `POST /v1/audio/speech` | OpenAI Speech | — |
| `POST /v1/audio/transcriptions` | OpenAI Transcriptions | — |
| `POST /v1/rerank` | Reranking | — |
| `POST /v1/videos/generations` | Video generation | — |
| `GET /v1/models` | OpenAI Models (catalog discovery) | — |

Routes are also served at their bare paths (`/chat/completions`), so mounting the handler under any prefix just works.

## Providers

Alibaba, Anthropic, Anthropic (AWS), AssemblyAI, Azure, Baseten, Amazon Bedrock, Black Forest Labs, ByteDance, Cerebras, Cohere, Deepgram, DeepInfra, DeepSeek, ElevenLabs, fal, Fireworks, Gladia, Google, Google Vertex, Groq, Hugging Face, Hume, Kling AI, LMNT, Luma, Mistral, Moonshot AI, OpenAI, Perplexity, Prodia, Replicate, Together AI, Vercel, Voyage, xAI — plus any number of custom OpenAI-compatible endpoints via `openaiCompatible`.

## Configuration

Drop a `gateway.config.ts` next to where you run the CLI (or point at one with `--config`):

```ts
import { defineConfig } from '@frogbotai/gateway';

export default defineConfig({
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY! },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
  },
  openaiCompatible: [
    { name: 'ollama', baseURL: 'http://localhost:11434/v1' },
  ],
  upstreamTimeoutMs: 60_000,
  hooks: {
    afterOperation: [
      ({ operation, model, usage }) => {
        console.log(operation, model, usage?.totalTokens);
      },
    ],
  },
});
```

Other options include `enabled_providers` / `disabled_providers` allow/deny lists, a custom `catalog` for `GET /v1/models`, `basePath`, `maxBodyBytes`, `logger`, `tracing`, and `tracer`.

## Embedding

`createGateway()` returns a WinterCG fetch handler — mount it anywhere:

```ts
import { serve } from '@hono/node-server';
import { createGateway } from '@frogbotai/gateway';

const gw = createGateway({
  providers: { openai: { apiKey: process.env.OPENAI_API_KEY! } },
});

serve({ fetch: gw.handler, port: 3939 });
```

Inside an existing Hono app:

```ts
app.mount('/v1', gw.handler);
```

Or as a Next.js route handler, a Bun/Deno server, or a Cloudflare Worker — anything that speaks `(req: Request) => Promise<Response>`.

## Hooks

Every route runs the same lifecycle: `beforeOperation` → `beforeUpstream` → `afterUpstream`/`afterError` → `afterOperation`. Hooks receive the operation name, the canonical `provider/model` ID, a shared mutable context bag, and (on the way out) aggregated token usage — summed across every round of a tool loop. Use them for auth, rate limiting, cost tracking, or audit logging.

## Observability

- **Logging** — pass any pino-compatible logger (or anything satisfying `GatewayLogger`), or let the gateway create its console logger
- **Tracing** — provide an OpenTelemetry `Tracer`, or use the Node-only `@frogbotai/gateway/setup` export to bootstrap one; the CLI honors `OTEL_EXPORTER_OTLP_ENDPOINT` out of the box

## Errors

All error responses use OpenAI's envelope:

```json
{
  "error": {
    "message": "...",
    "type": "invalid_request_error",
    "code": "string | null",
    "param": "string | null"
  }
}
```

Same-provider upstream errors (e.g. an invalid OpenAI key on an OpenAI call) are forwarded verbatim with the upstream HTTP status. Gateway-originated errors follow the same shape with the gateway's own `code` values. Error helpers are exported from `@frogbotai/gateway/errors` so embedders can produce matching envelopes.

## Part of FrogBot

The gateway powers [FrogBot](https://github.com/frogbotai/frogbot), the config-first AI agent framework — but it has zero FrogBot dependencies and works great on its own.

## License

[MIT](https://github.com/frogbotai/frogbot/blob/main/LICENSE) © Colby Gilbert

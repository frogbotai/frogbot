# Gateway example: AWS Bedrock + self-hosted inference

One `@frogbotai/gateway` instance — embedded in a ~50-line Hono server (`src/server.ts`) — fronting two very different backends through a single OpenAI-compatible API:

- **AWS Bedrock** — managed models (Claude, Nova, Llama, ...) using your AWS credentials
- **Ollama** — real self-hosted inference running on your machine, standing in for any OpenAI-compatible endpoint (vLLM, TGI, SGLang, ...) you run on your own GPUs

```
                          ┌──────────────────────┐
  opencode / OpenAI SDK   │  @frogbotai/gateway  │──── amazon-bedrock/... ──▶ AWS Bedrock
  curl / any client  ────▶│  localhost:3939/v1   │
                          │                      │──── ollama/... ──────────▶ Ollama (:11434)
                          └──────────────────────┘
```

Clients pick the backend with the model prefix: `amazon-bedrock/<model>` or `ollama/<model>`. Nothing else about the request changes.

## Setup

```bash
pnpm install --ignore-workspace   # or: npm install
cp .env.example .env
```

For the self-hosted side, [install Ollama](https://ollama.com/download) and pull a model:

```bash
ollama pull llama3.2
```

Fill in the AWS slots in `.env`. Two auth modes are supported — use one:

| Variable | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | SigV4 credentials (add `AWS_SESSION_TOKEN` for temporary/SSO creds) |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock API key (bearer) mode — simplest path, region defaults to `us-east-1` |
| `ANTHROPIC_API_KEY` | Direct Anthropic provider — enables `anthropic/...` routes |
| `OPENAI_API_KEY` | Direct OpenAI provider — enables `openai/...` routes |
| `FIREWORKS_API_KEY` | Fireworks provider — enables `fireworks/...` routes |
| `OLLAMA_BASE_URL` | Ollama's OpenAI-compatible endpoint (defaults to `http://localhost:11434/v1`) |

Every provider slot is optional and independent: leave a slot empty and that provider is simply skipped — the startup log prints exactly which providers registered. Reasoning (`reasoning_effort`) is translated to native extended-thinking for Claude on both `amazon-bedrock/...` and `anthropic/...`.

## Run

```bash
pnpm dev
```

The gateway starts on `:3939` (`pnpm start` for no file watching). Everything lives in `src/server.ts`: it loads `.env`, builds the Bedrock provider from the AWS env vars (bearer or SigV4), registers Ollama as an OpenAI-compatible endpoint, logs token usage after every request via an `afterOperation` hook, and serves `createGateway().handler` with `@hono/node-server`. Fully typed — your editor autocompletes the whole config.

## Try it

Self-hosted route (no AWS credentials needed):

```bash
curl http://localhost:3939/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "ollama/llama3.2",
    "messages": [{ "role": "user", "content": "Where are you running?" }],
    "stream": true
  }'
```

Bedrock route:

```bash
curl http://localhost:3939/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0",
    "messages": [{ "role": "user", "content": "Hello from Bedrock" }]
  }'
```

Bedrock model IDs pass through as-is, so use whatever your account has access to — cross-region inference profiles (`us.anthropic...`, `eu.amazon...`) or base IDs. Shorthands like `amazon-bedrock/claude-4-sonnet` and `amazon-bedrock/nova-pro` resolve to the base model IDs, which require on-demand access rather than an inference profile.

## Point opencode at it

This directory ships an `opencode.json` that registers the gateway as a provider. With the gateway running, start `opencode` from this directory and pick a model:

```bash
opencode
```

Models available under the `frogbot-gateway` provider:

- `amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0` — Claude Sonnet 4 via Bedrock
- `amazon-bedrock/us.amazon.nova-pro-v1:0` — Nova Pro via Bedrock
- `ollama/llama3.2` — local inference via Ollama

opencode never sees an AWS credential — it talks plain OpenAI wire format to `localhost:3939/v1` and the gateway holds the upstream keys. Any other OpenAI-compatible client (OpenAI SDK, LangChain, LiteLLM, curl) works the same way.

## Your own GPU cluster instead of Ollama

Ollama is just a stand-in for "an OpenAI-compatible endpoint you run yourself." Against a real cluster, edit the entry in `src/server.ts`:

```ts
openaiCompatible: [
  {
    name: 'gpu-cluster',
    baseURL: 'https://inference.internal.example.com/v1',
    apiKey: process.env.GPU_INFERENCE_API_KEY,
  },
],
```

Anything that speaks the OpenAI chat completions protocol (vLLM, TGI, SGLang, llama.cpp server, ...) works unchanged, and you can declare as many entries as you have clusters — each becomes its own `<name>/<model>` prefix.

## Deploying

`src/server.ts` is the deployment unit — it runs anywhere Node ≥ 20 runs (container, VM, `node dist/server.js` after a `tsc` build). To use IAM roles instead of static keys, pass the AWS credential chain to the Bedrock provider: `{ region, credentialProvider: fromNodeProviderChain() }` (from `@aws-sdk/credential-providers`).

Because the gateway is just a fetch handler, the same `createGateway()` call also mounts inside an existing Hono/Next.js/Bun service (`app.mount('/v1', gateway.handler)`) — no separate process required. And for zero-code, env-only setups there's a standalone CLI: `npx @frogbotai/gateway`.

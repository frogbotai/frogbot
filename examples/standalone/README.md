# FrogBot Example: Standalone Server

FrogBot without Next.js. You own the HTTP server — a small [Hono](https://hono.dev)
app that mounts FrogBot's two request handlers:

- `frogbot.handleRequest` — the full REST API (`/api/*`), including agents
- `createGatewayHandler(frogbot)` — the OpenAI-compatible AI gateway (`/api/ai/*`)

No admin panel here; that requires the Next.js setup (`npm create frogbot-app`).
Use this model for headless deployments, workers, or embedding FrogBot into an
existing server.

## Quick Start

```bash
pnpm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY

pnpm dev
```

## Try it

Ask the agent something:

```bash
curl -s http://localhost:3000/api/agents/assistant \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello!"}' | jq
```

The gateway (`/api/ai/*`) requires an authenticated FrogBot user — an
unauthenticated request returns 401:

```bash
curl -s http://localhost:3000/api/ai/v1/models
```

## How it works

`src/server.ts` is the whole server:

```ts
const frogbot = await getFrogbot({ config });
const gatewayHandler = createGatewayHandler(frogbot);

const app = new Hono();
app.all('/api/ai/*', (c) => gatewayHandler(c.req.raw));
app.all('/api/*', (c) => frogbot.handleRequest(c.req.raw.clone()));
```

Route order matters: mount `/api/ai/*` before `/api/*`. Both handlers speak
Fetch `Request`/`Response`, so any framework (or none) works — Hono is just
the example.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the server with file-watching (`tsx watch`) |
| `pnpm start` | Run the server once |
| `pnpm generate:types` | Regenerate `frogbot-types.ts` from this config |
| `pnpm typecheck` | Type-check the project |

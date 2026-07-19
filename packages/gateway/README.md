# `@frogbotai/gateway`

The open-source, self-hostable AI gateway built on the Vercel AI SDK. The
server side of what Vercel kept closed-source.

M0 ships a single non-streaming route — `POST /v1/chat/completions` — wired
through the AI SDK to any configured provider. It is fully compatible with the
official OpenAI Node SDK and any client that speaks OpenAI's chat-completions
wire format.

## Quick start

```bash
OPENAI_API_KEY=sk-... bunx @frogbotai/gateway
```

Defaults:

- `HOST=0.0.0.0`
- `PORT=8787`
- Provider auto-discovery from env vars (currently: `OPENAI_API_KEY`).

If no providers are configured the CLI exits with a friendly error listing the
env vars it looked for.

## Use it with the OpenAI SDK

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'unused', // gateway forwards the upstream key from its own env
  baseURL: 'http://localhost:8787/v1',
});

const res = await client.chat.completions.create({
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

Model IDs are namespaced as `<provider>/<model>` — bare names (`gpt-4o-mini`)
return a 400. The provider prefix tells the gateway which configured provider
to dispatch to.

## Use it with `curl`

```bash
curl http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

## Errors

All error responses share OpenAI's envelope:

```json
{
  "error": {
    "message": "...",
    "type": "invalid_request_error" | "authentication_error" | "not_found_error" | "rate_limit_error" | "server_error" | "...",
    "code": "string | null",
    "param": "string | null"
  }
}
```

Same-provider upstream errors (e.g. an invalid OpenAI key when calling OpenAI)
are forwarded verbatim with the upstream HTTP status. Gateway-originated
errors (bare model id, unconfigured provider, `stream: true` in M0) follow
the same shape with our own `code` values.

## Embedding the gateway

The CLI is a thin wrapper around `createGateway({ providers })`. To embed in a
custom server (custom auth, custom routing, etc.):

```ts
import { serve } from '@hono/node-server';
import { createGateway } from '@frogbotai/gateway';

const gw = createGateway({
  providers: { openai: { apiKey: process.env.OPENAI_API_KEY! } },
});

serve({ fetch: gw.handler, port: 8787 });
```

The same `toOpenAIErrorResponse` translator the CLI uses is exported so
embedders can produce matching envelopes outside the gateway's own handler.

## Streaming

Not in M0. Sending `stream: true` returns `400 streaming_not_supported`.
Streaming SSE ships in M1.

## Status

M0 — first wire. Single-route, single-provider, non-streaming. See
`dev/plans/frogbot_gateway/` for the milestone plan.

## License

MIT.

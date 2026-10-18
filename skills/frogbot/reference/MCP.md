# MCP

Docs: https://docs.frogbot.ai/mcp/overview and https://docs.frogbot.ai/plugins/mcp

`@frogbotai/plugin-mcp` exposes the app's collections to MCP clients over Streamable HTTP. It authenticates requests with hashed, revocable keys from `@frogbotai/plugin-api-keys`; every call runs as the key's owner, under the collections' access control.

## Install

```bash
pnpm add @frogbotai/plugin-mcp @frogbotai/plugin-api-keys
```

## Configure

Configure both plugins in `frogbot.config.ts`. `apiKeysPlugin()` must appear before `mcpPlugin()` so the MCP endpoint can use its authentication strategy.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { mcpPlugin } from '@frogbotai/plugin-mcp';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'posts',
      fields: [
        {
          name: 'title',
          type: 'text',
        },
      ],
    },
  ],
  plugins: [apiKeysPlugin(), mcpPlugin()],
});
```

Every app collection is exposed by default, behind its access control; FrogBot's own collections never are. Turn a collection's built-in tools off with `collections: { posts: { tools: { delete: false } } }`. Options: `collections`, `globals`, `tools`, `prompts`, `resources`, `hooks`, `mcp`. Build custom tools with `defineTool` from `@frogbotai/plugin-mcp`.

## Connect a client

Create a key in the API Keys admin collection, then configure the external MCP client with:

| Setting   | Value                                  |
| --------- | -------------------------------------- |
| Transport | Streamable HTTP                        |
| URL       | `https://your-app.example/api/mcp`     |
| Header    | `Authorization: Bearer <minted-token>` |

The MCP client owns its own transport configuration. Do not import server plugins into that client or expose application secrets beyond the scoped bearer key. Revoked, malformed, and unknown keys are rejected.

SSE transport is not supported.

# MCP

Docs: https://docs.frogbot.ai/mcp/overview and https://docs.frogbot.ai/plugins/mcp

`@frogbotai/plugin-mcp` exposes selected FrogBot collection operations as tools over Streamable HTTP. It authenticates requests with hashed, revocable keys from `@frogbotai/plugin-api-keys`.

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
  plugins: [
    apiKeysPlugin(),
    mcpPlugin({
      collections: {
        posts: {
          enabled: {
            find: true,
          },
        },
      },
    }),
  ],
});
```

Enable only the collections and operations the client needs. The plugin also accepts its public custom-tool, response-override, and handler options. Experimental configuration, collection-definition tools, job tools, and authentication-mutation tools are not supported.

## Connect a client

Create a key in the API Keys admin collection, then configure the external MCP client with:

| Setting   | Value                                  |
| --------- | -------------------------------------- |
| Transport | Streamable HTTP                        |
| URL       | `https://your-app.example/api/mcp`     |
| Header    | `Authorization: Bearer <minted-token>` |

The MCP client owns its own transport configuration. Do not import server plugins into that client or expose application secrets beyond the scoped bearer key. Revoked, malformed, and unknown keys are rejected.

SSE transport is not supported.

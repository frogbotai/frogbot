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

## Give agents an MCP server's tools

The other direction: `mcpServer()` from `frogbot/tools` lets an agent call another server's tools. Put it in an agent's `tools`, or in root `tools` for every agent that doesn't set `inheritTools: false`.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import { mcpServer } from 'frogbot/tools';

export const config = buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [{ slug: 'users', auth: true, fields: [] }],
  ai: { providers: { openai: { apiKey: process.env.OPENAI_API_KEY! } } },
  tools: [
    mcpServer({
      name: 'docs',
      type: 'remote',
      url: 'https://docs.example.com/mcp',
      headers: { Authorization: `Bearer ${process.env.DOCS_MCP_TOKEN}` },
    }),
  ],
  agents: [
    {
      slug: 'researcher',
      model: 'openai/gpt-5.4-mini',
      instructions: 'Use the browser tools to read pages.',
      tools: [
        mcpServer({
          name: 'sidekick',
          type: 'local',
          command: ['npx', '-y', '@frogbotai/sidekick-mcp'],
          environment: { SIDEKICK_TOKEN: process.env.SIDEKICK_TOKEN! },
          timeout: { execution: 10 * 60_000 },
        }),
      ],
    },
  ],
});
```

- Local servers (`command`, `cwd`, `environment`) run over stdio and get FrogBot's environment plus `environment`; remote servers (`url`, `headers`) use Streamable HTTP. `timeout`: `startup` and `catalog` default to 30 s, `execution` to 12 h.
- Tools reach the model as `<name>_<tool>`, for example `sidekick_navigate`. An agent's own tool with that name wins, with a warning.
- Each agent opens its own connection on its first run, never at init, and keeps it; `destroy()` and a config reload close them. Each run lists the tools again.
- A server that fails is left out of that run with one warning; the run goes on. A local server that exits mid-run fails its call, logs one warning and starts again next run; one that ignores `SIGTERM` on close gets `SIGKILL` after 2 s.
- Images in results reach the model as images, also when a chat replays.
- No approval step: who may run the agent (`access`) may use its servers.
- Sidekick: in its settings, Connected agents → Other, name it `FrogBot`, and copy `SIDEKICK_TOKEN` from the command it shows. Each agent gets its own tab group, `FrogBot · <agent slug>`.

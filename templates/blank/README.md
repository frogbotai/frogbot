# FrogBot Blank Template

The minimum FrogBot setup: a `users` auth collection, database storage, two agents
(`general` and `assistant`), and the admin panel served by Next.js. No Docker is
required.

The `users` file is an example you can customize, not a framework requirement. Configuring the agent automatically adds `chats` and `messages`, where your chats are saved.

## Quick Start

`create-frogbot-app` already wrote a `.env` with a generated `FROGBOT_SECRET`.
Both agents run on the provider you picked (OpenAI's
`openai/gpt-5.4-mini` by default). If you entered an API key, it is already in
`.env`; otherwise set it there (for example `OPENAI_API_KEY=...`) before you
start the app. Choose another provider with the `create-frogbot-app --ai` option.

FrogBot commands load `.env`, `.env.local`, and mode-specific `.env*` files with Next.js
precedence. Existing shell variables take priority.

Start the dev server. Any package manager works — npm, pnpm, yarn, or bun.

```bash
npm run dev
```

If you created the project with `--no-install`, run `npm install` first. On pnpm
10.26 or newer, the generated `pnpm-workspace.yaml` pre-approves the dependency
build scripts this project needs.

Then open [http://localhost:3000](http://localhost:3000) and create your admin
account. The dashboard lists your collections; open **Chat → Chats** in the
sidebar and select **Create New** to talk to an agent.

To call agents from your own code, see the
[REST API](https://docs.frogbot.ai/rest-api/overview).

## Project layout

| Path                    | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `src/frogbot.config.ts` | Your FrogBot config — agents, collections, providers             |
| `src/app/(frogbot)/`    | Admin panel + API routes (owned by FrogBot, safe to leave alone) |
| `src/frogbot-types.ts`  | Generated types (`npm run generate:types`)                       |

To use a root layout instead, move everything out of `src/` and update the
`@/*` and `@frogbot-config` paths in `tsconfig.json`. No config, import-map, or
type-generation changes are needed — both layouts are detected automatically.

## Next steps

- Add tools to the agent (`tools: [...]` with a Zod `inputSchema`).
- Add collections (`collections: [...]`) for FrogBot's data layer.
- Choose PostgreSQL or MongoDB with `create-frogbot-app --db` when creating a project.
- Restrict agent `access` (e.g. `({ req }) => !!req.user`) before deploying.

## Add an AI provider

Projects created with `--ai none` omit the agent and AI configuration. Follow the
[AI overview](https://docs.frogbot.ai/ai/overview) when you are ready to add one.

## Scripts

| Script               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `dev`                | Start the Next.js dev server (`frogbot dev`)       |
| `build`              | Production build (`next build`)                    |
| `start`              | Serve the production build (`frogbot start`)       |
| `generate:types`     | Regenerate `src/frogbot-types.ts` from this config |
| `generate:importmap` | Regenerate `src/app/(frogbot)/importMap.js`        |
| `typecheck`          | Type-check the project                             |

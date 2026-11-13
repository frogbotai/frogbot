# Agents

Docs: https://docs.frogbot.ai/agents/overview

Agents combine instructions, a model, tools, and optional runtime skills. Register agent configs in `frogbot.config.ts`; initialized agents are available by slug through `frogbot.agents`.

## Define and register an agent

The blank template keeps each agent in `src/agents` and imports the `AgentConfig` type from the public root export:

```ts
import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'You are a concise and friendly assistant.',
};
```

Register it alongside any presets:

```ts
import type { FrogBotConfig } from 'frogbot';
import { general } from 'frogbot/agents';

import { assistant } from './agents/assistant';

const agents: FrogBotConfig['agents'] = [general(), assistant];
```

The surrounding config must also provide the required database, collections, secret, and AI provider settings. An agent without `model` uses the configured default model.

Use `model: { default, options: [...] }` for curated choices or `model: { options: '*' }` for every configured chat model; omitted `default` uses `ai.defaultModel`, and the default is included automatically. `general()` uses `'*'`; a string `model` narrows it to one choice, and `ai.access.generate` still hides models a user may not use.

## Agent knowledge that changes

A string `instructions` is fixed until the app restarts. Pick the place for knowledge by how it changes:

- Guidance that changes between runs (rules in a collection, a file staff edit) goes in an `instructions` function, `({ req }) => string | Promise<string>`. It runs once per run, before the model; read data through `req.frogbot` so access and the run's user apply. Don't cache file contents or indexes in module-level variables unless you rebuild them when the source changes.
- Long or optional material (docs, plans, archives) goes in a runtime skill whose `instructions` or resource `content` are functions; the agent loads it on demand. Keep the system prompt to stable persona and rules.
- A chat that already loaded a skill keeps that text for the rest of the chat. After a big change, start a new chat.
- The function runs on every run, including schedule and trigger runs, so keep it fast and cache slow reads yourself. An empty or non-string result fails the run.

```ts
import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: async ({ req }) => {
    const { docs } = await req.frogbot.find({ collection: 'policies', limit: 1, req });

    return `Follow this policy: ${String(docs[0]?.body ?? 'none')}`;
  },
};
```

## Run an agent

Use an initialized FrogBot instance and select the agent by slug:

```ts
import { getFrogBot } from 'frogbot';

import config from './frogbot.config';

const frogbot = await getFrogBot({ config });
const result = await frogbot.agents.assistant.generate({
  prompt: "Summarize today's open tasks.",
  overrideAccess: true,
});

console.log(result.text);
```

`generate` and `stream` accept either `prompt` or `messages`. Pass `req` when the run needs the current user or request context. Programmatic calls run as `req`'s user and check the agent's `access` function, so a call with no user is refused with `403` by default. Server code with nobody signed in, such as a schedule `handler` or piece trigger `handler`, passes `overrideAccess: true` to run trusted; tools then see `ctx.overrideAccess: true` and tool `access` rules are skipped.

## Tools

Root `tools` are inherited by every agent unless `inheritTools: false` is set. Agent-local tools are added with `tools`; an agent-local tool with the same slug shadows the root tool.

This whole file is an agent with its own tool. The tool passes `req` and the run's `overrideAccess` to the Local API, so in chat it reads only what the user may read, and its `access` rule offers it only to signed-in users. It assumes a `projects` collection with a text `title` field:

```ts
// src/agents/projectAssistant.ts
import type { AgentConfig, Tool } from 'frogbot';
import { z } from 'zod';

const searchInput = z.object({ query: z.string() });

export const searchProjects: Tool<typeof searchInput> = {
  slug: 'search_projects',
  description: 'Search projects by title.',
  inputSchema: searchInput,
  access: ({ req }) => Boolean(req.user),
  async execute({ query }, { frogbot, req, overrideAccess }) {
    const projects = await frogbot.find({
      collection: 'projects',
      where: { title: { contains: query } },
      req,
      overrideAccess,
    });

    return projects.docs;
  },
};

export const projectAssistant: AgentConfig = {
  slug: 'project-assistant',
  instructions: 'Answer questions about projects. Search before you answer.',
  tools: [searchProjects],
  inheritTools: false,
};
```

Register it in `frogbot.config.ts`. It has no `model`, so the app needs an `ai` config with a `defaultModel`:

```ts
import { projectAssistant } from './agents/projectAssistant';

const agents: FrogBotConfig['agents'] = [general(), projectAssistant];
```

See the [Tools skill reference](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/TOOLS.md) for the `Tool` contract.

## Runtime skills

`AgentConfig.skills` contains runtime `SkillConfig` values. FrogBot exposes them to that running agent through `list_skills`, `load_skill`, and `load_skill_resource`; instruction and resource content may be strings or functions receiving `{ req, frogbot }`. `resources` itself may be a function receiving `{ req }`, called on every `list_skills` and `load_skill_resource`, for a list that changes while the app runs (a folder of files); its entries are checked when it runs.

```ts
import type { AgentConfig, SkillConfig } from 'frogbot';

const supportPolicy: SkillConfig = {
  slug: 'support-policy',
  description: 'Customer support policy',
  instructions: 'Apply the support policy before proposing a resolution.',
  resources: [
    {
      path: 'refunds.md',
      description: 'Refund rules',
      content: 'Refunds require an order number and a verified customer email.',
    },
  ],
};

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Help customers resolve support requests.',
  skills: [supportPolicy],
};
```

These runtime skills are application configuration. They are distinct from the `skills/frogbot` coding skill that guides a coding agent working on a FrogBot project; reference files from the coding skill are not automatically available to an app's runtime agents.

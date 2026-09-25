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

## Run an agent

Use an initialized FrogBot instance and select the agent by slug:

```ts
import { getFrogBot } from 'frogbot';

import config from './frogbot.config';

const frogbot = await getFrogBot({ config });
const result = await frogbot.agents.assistant.generate({
  prompt: "Summarize today's open tasks.",
});

console.log(result.text);
```

`generate` and `stream` accept either `prompt` or `messages`. Pass `req` when the run needs the current user or request context. Programmatic calls override agent access by default; set `overrideAccess: false` to enforce the agent's `access` function.

## Tools

Root `tools` are inherited by every agent unless `inheritTools: false` is set. Agent-local tools are added with `tools`; an agent-local tool with the same slug shadows the root tool.

```ts
export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Answer with the available project data.',
  tools: [searchProjects],
  inheritTools: false,
};
```

See the [Tools skill reference](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/TOOLS.md) for the `Tool` contract.

## Runtime skills

`AgentConfig.skills` contains runtime `SkillConfig` values. FrogBot exposes them to that running agent through `list_skills`, `load_skill`, and `load_skill_resource`; instruction and resource content may be strings or functions receiving `{ req, frogbot }`.

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

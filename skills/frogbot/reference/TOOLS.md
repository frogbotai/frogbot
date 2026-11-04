# Tools

Docs: https://docs.frogbot.ai/agents/overview

Tools let an agent call server-side application code. Define them with the public `Tool` type, a unique slug, a description, a Zod input schema, and an `execute` function.

## Define a tool

```ts
import type { Tool } from 'frogbot';
import { z } from 'zod';

const inputSchema = z.object({
  projectId: z.string(),
});

export const getProjectStatus: Tool<typeof inputSchema, { status: string }> = {
  slug: 'get_project_status',
  description: 'Return the current status of a project.',
  inputSchema,
  async execute({ projectId }, { frogbot, req, overrideAccess }) {
    const project = await frogbot.findByID({
      collection: 'projects',
      id: projectId,
      req,
      overrideAccess,
    });

    if (typeof project.status !== 'string') {
      throw new Error('Project status must be a string.');
    }

    return { status: project.status };
  },
};
```

`execute` receives validated input and a context containing:

| Property         | Value                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| `frogbot`        | The initialized FrogBot instance                                              |
| `req`            | The current `FrogBotRequest`                                                  |
| `agent`          | The current agent `slug`, `runId`, and optional `chatId`                      |
| `overrideAccess` | Whether the run is trusted: `false` in chat and over MCP, `true` on schedules |

Collection slugs and returned document fields are typed from the generated `frogbot-types.ts` file. Before type generation, document fields are `unknown`; the status guard keeps this example usable in that context too. The `projects` collection must define a text `status` field.

Pass `req` and the context's `overrideAccess` to Local API calls: in chat, collection and field permissions apply for the signed-in user, on a schedule with no user the call stays trusted, and either way it shares the request transaction. Hard-coding `true` would skip the user's access in chat.

## Register tools

Root tools are inherited by agents by default:

```ts
import type { FrogBotConfig } from 'frogbot';

const tools: FrogBotConfig['tools'] = [getProjectStatus];
const agents: FrogBotConfig['agents'] = [assistant];
```

Attach a tool only to one agent with `AgentConfig.tools`:

```ts
import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Report project status from the available tools.',
  tools: [getProjectStatus],
};
```

Set `inheritTools: false` when an agent must not receive root tools.

## Built-in todo tools

The blank template registers the public todo tool set from `frogbot/tools`:

```ts
import type { FrogBotConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

const tools: FrogBotConfig['tools'] = [...todoTools];
```

`todoTools` contains `write_todos` and `read_todos`. They require chat persistence and a current chat.

## Runtime skill tools

Agents with runtime skills receive the reserved tools `list_skills`, `load_skill`, and `load_skill_resource`. Do not define application tools with those slugs. Runtime skills belong to the running app and are distinct from the `skills/frogbot` coding skill used while editing a project.

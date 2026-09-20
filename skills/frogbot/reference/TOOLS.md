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
  async execute({ projectId }, { frogbot, req }) {
    const project = await frogbot.findByID({
      collection: 'projects',
      id: projectId,
      req,
      overrideAccess: false,
    });

    if (typeof project.status !== 'string') {
      throw new Error('Project status must be a string.');
    }

    return { status: project.status };
  },
};
```

`execute` receives validated input and a context containing:

| Property  | Value                                                    |
| --------- | -------------------------------------------------------- |
| `frogbot` | The initialized FrogBot instance                         |
| `req`     | The current `FrogbotRequest`                             |
| `agent`   | The current agent `slug`, `runId`, and optional `chatId` |

Collection slugs and returned document fields are typed from the generated `frogbot-types.ts` file. Before type generation, document fields are `unknown`; the status guard keeps this example usable in that context too. The `projects` collection must define a text `status` field.

For agent-supplied IDs and queries, pass both `req` and `overrideAccess: false` to Local API calls so collection and field permissions apply. Passing `req` alone does not disable the Local API's access bypass.

## Register tools

Root tools are inherited by agents by default:

```ts
import type { FrogbotConfig } from 'frogbot';

const tools: FrogbotConfig['tools'] = [getProjectStatus];
const agents: FrogbotConfig['agents'] = [assistant];
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
import type { FrogbotConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

const tools: FrogbotConfig['tools'] = [...todoTools];
```

`todoTools` contains `write_todos` and `read_todos`. They require chat persistence and a current chat.

## Runtime skill tools

Agents with runtime skills receive the reserved tools `list_skills`, `load_skill`, and `load_skill_resource`. Do not define application tools with those slugs. Runtime skills belong to the running app and are distinct from the `skills/frogbot` coding skill used while editing a project.

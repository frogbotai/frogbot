import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import type {
  AgentConfig,
  AgentModelId,
  AgentModelOptions,
  SanitizedAgentConfig,
} from '../../../../packages/frogbot/src/agents/types.js';
import type { Tool, ToolCtx } from '../../../../packages/frogbot/src/tools/types.js';

describe('agent types', () => {
  it('accepts a model ID as agent input', () => {
    const model = 'openai/gpt-4o-mini' as const;

    expectTypeOf(model).toMatchTypeOf<AgentConfig['model']>();
  });

  it('accepts readonly explicit model options with an optional default', () => {
    const options = ['openai/gpt-4o-mini', 'openai/gpt-4o'] as const;
    const model = { default: 'openai/gpt-4o-mini', options } as const;

    expectTypeOf(model).toMatchTypeOf<AgentModelOptions>();
    expectTypeOf(model).toMatchTypeOf<AgentConfig['model']>();
    expectTypeOf({ options }).toMatchTypeOf<AgentConfig['model']>();
  });

  it('accepts wildcard model options with and without a default', () => {
    const inherited = { options: '*' } as const;
    const explicit = { default: 'openai/gpt-4o-mini', options: '*' } as const;

    expectTypeOf(inherited).toMatchTypeOf<AgentConfig['model']>();
    expectTypeOf(explicit).toMatchTypeOf<AgentConfig['model']>();
  });

  it('requires resolved model options on sanitized agents', () => {
    expectTypeOf<SanitizedAgentConfig['model']>().toEqualTypeOf<{
      default: AgentModelId;
      options: readonly AgentModelId[];
    }>();
    expectTypeOf<AgentConfig['model']>().toEqualTypeOf<
      AgentModelId | AgentModelOptions | undefined
    >();
    expectTypeOf<'allowModels'>().not.toMatchTypeOf<keyof AgentConfig>();
  });

  it('infers annotated tool input and context', () => {
    const schema = z.object({ query: z.string() });
    const tool: Tool<typeof schema> = {
      slug: 'search',
      description: 'Search',
      inputSchema: schema,
      execute: (input, ctx) => {
        expectTypeOf(input).toEqualTypeOf<{ query: string }>();
        expectTypeOf(ctx).toEqualTypeOf<ToolCtx>();
      },
    };

    expectTypeOf(tool).toMatchTypeOf<Tool<typeof schema>>();
  });
});

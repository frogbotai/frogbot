import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import type { Tool, ToolCtx } from '../types/tool.js';

describe('agent types', () => {
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

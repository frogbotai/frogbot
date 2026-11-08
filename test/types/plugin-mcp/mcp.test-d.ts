import { createMathHelper } from '@frogbotai/piece-math-helper';
import type { McpPluginOptions, McpTool } from '@frogbotai/plugin-mcp';
import { definePrompt, mcpPlugin } from '@frogbotai/plugin-mcp';
// @ts-expect-error -- MCP tools are FrogBot tools; Payload's builders aren't exported.
import { defineTool } from '@frogbotai/plugin-mcp';
import type { Tool, ToolAnnotations } from 'frogbot';
import { definePiece } from 'frogbot/pieces';
import { question, write_todos } from 'frogbot/tools';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

void defineTool;

const lookupTicket: Tool<z.ZodObject<{ id: z.ZodString }>, { id: string }> = {
  slug: 'lookupTicket',
  description: 'Look up a ticket.',
  inputSchema: z.object({ id: z.string() }),
  execute: ({ id }) => ({ id }),
};

const math = createMathHelper();

mcpPlugin({ tools: [lookupTicket, math, math.addNumbers, write_todos, question] });

expectTypeOf<NonNullable<McpPluginOptions['tools']>>().toEqualTypeOf<readonly McpTool[]>();

mcpPlugin({
  // @ts-expect-error -- `tools` is an array, not Payload's record.
  tools: { lookupTicket },
});

mcpPlugin({
  collections: {
    posts: {
      description: 'Blog posts',
      tools: {
        delete: false,
        find: { description: 'Find posts.' },
        // @ts-expect-error -- collection tool maps only turn off or reword built-ins.
        lookupTicket: { description: 'Look up a ticket.', handler: () => ({ content: [] }) },
      },
    },
    users: { tools: { login: true } },
  },
});

mcpPlugin({
  // @ts-expect-error -- FrogBot has no globals (DR-015).
  globals: { settings: { description: 'Site settings' } },
});

mcpPlugin({
  prompts: {
    greet: definePrompt({
      title: 'Greet',
      description: 'Greet someone.',
      argsSchema: z.object({ name: z.string() }),
    }).handler(({ input }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Hello ${input.name}` } }],
    })),
  },
});

const deleteTicket: Tool = {
  slug: 'deleteTicket',
  description: 'Delete a ticket.',
  annotations: { title: 'Delete ticket', destructiveHint: true, idempotentHint: true },
  inputSchema: z.object({ id: z.string() }),
  execute: () => null,
};

mcpPlugin({
  resourceMetadataURL: 'https://app.example.com/.well-known/oauth-protected-resource',
  tools: [deleteTicket, { ...math.addNumbers, annotations: { readOnlyHint: true } }],
});

expectTypeOf<NonNullable<Tool['annotations']>>().toEqualTypeOf<ToolAnnotations>();

const misspelt: Tool = {
  ...deleteTicket,
  // @ts-expect-error -- hints use MCP's names, such as `destructiveHint`.
  annotations: { destructive: true },
};

void misspelt;

definePiece({
  slug: 'tickets',
  label: 'Tickets',
  admin: { description: 'Tickets', group: 'Test' },
  actions: [
    {
      slug: 'remove',
      description: 'Delete a ticket.',
      input: z.object({ id: z.string() }),
      idempotent: true,
      annotations: { destructiveHint: true },
      run: () => Promise.resolve({ ok: true }),
    },
    {
      slug: 'lookup',
      description: 'Look up a ticket.',
      input: z.object({ id: z.string() }),
      // @ts-expect-error -- a piece action's hints have the same names as a tool's.
      annotations: { readOnly: true },
      run: () => Promise.resolve({ ok: true }),
    },
  ],
});

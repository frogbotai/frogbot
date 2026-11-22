import { z } from 'zod';

import type { ToolApproval, ToolApprovalOption, ToolApprovalResult } from '../tools/approval.js';
import type { AnyTool, ToolCtx } from '../tools/types.js';
import { isMemoryAdapterError } from './errors.js';
import { type MemoryRun, memoryRun } from './run-context.js';
import type { Memory, MemoryCallArgs } from './types.js';

export const MEMORY_TOOL_SLUGS = ['memory_search', 'memory_save', 'memory_forget'] as const;

export type MemoryToolSlug = (typeof MEMORY_TOOL_SLUGS)[number];

const DEFAULT_APPROVAL: Record<MemoryToolSlug, ToolApprovalOption> = {
  memory_search: false,
  memory_save: false,
  memory_forget: 'ask',
};

const SEARCH_LIMIT = 10;

const FORBIDDEN = 'Memory forbidden: the app does not let this person change this scope.';

const scopeInput = z
  .string()
  .optional()
  .describe(
    'A scope word from the Memory section of your instructions, such as `me` or `agent`. Never an ID.',
  );

function approvalFor(slug: MemoryToolSlug): ToolApproval {
  return (args): ToolApprovalResult | Promise<ToolApprovalResult> => {
    const option =
      args.req.frogbot.config.memory?.tools?.[slug]?.approval ?? DEFAULT_APPROVAL[slug];

    return typeof option === 'function' ? option(args) : option;
  };
}

function line({ id, key, pinned, scope, text }: Memory): string {
  const tags = [scope, ...(key ? [`key: ${key}`] : []), ...(pinned ? ['pinned'] : [])];

  return `- [${id}] (${tags.join(', ')}) ${text}`;
}

async function call<T>(
  ctx: ToolCtx,
  run: (args: { memory: MemoryRun; base: Omit<MemoryCallArgs, 'scope'> }) => Promise<T>,
): Promise<T | string> {
  try {
    const memory = await memoryRun(ctx);

    return await run({ memory, base: memory.callArgs });
  } catch (error) {
    if (isMemoryAdapterError(error)) return `Memory ${error.code}: ${error.message}`;

    throw error;
  }
}

/**
 * The memory tools an agent with `memory: true` gets. List them in an MCP server plugin's tools to
 * serve memory over MCP. They take a scope word, never a scope ID, and run as the run's user.
 */
export const memoryTools: readonly AnyTool[] = [
  {
    slug: 'memory_search',
    label: 'Memory: Search',
    description:
      'Search saved memories. Without a scope, searches every scope you can use. Results show each memory as `[id] (scope) text`.',
    inputSchema: z.object({
      query: z.string().min(1).describe('What to look for'),
      scope: scopeInput,
    }),
    approval: approvalFor('memory_search'),
    execute: ({ query, scope }, ctx) =>
      call(ctx, async ({ memory, base }) => {
        const scopes = scope === undefined ? await memory.available() : [scope];
        const hits = (
          await Promise.all(
            scopes.map((word) =>
              ctx.frogbot.memory.search({ ...base, scope: word, query, limit: SEARCH_LIMIT }),
            ),
          )
        )
          .flat()
          .sort((a, b) => b.score - a.score)
          .slice(0, SEARCH_LIMIT);

        return hits.length === 0
          ? 'No memories found.'
          : hits.map((hit) => line(hit.memory)).join('\n');
      }),
  },
  {
    slug: 'memory_save',
    label: 'Memory: Save',
    description:
      'Save a fact worth remembering in later chats. Saving with an existing `key` replaces that memory. Pin only facts needed in every chat.',
    inputSchema: z.object({
      text: z.string().min(1).describe('The fact, in one or two sentences'),
      scope: scopeInput,
      key: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('A stable name, such as `preferred-contact`'),
      pinned: z.boolean().optional().describe('Keep it in view in every chat'),
    }),
    approval: approvalFor('memory_save'),
    execute: ({ key, pinned, scope, text }, ctx) =>
      call(ctx, async ({ memory, base }) => {
        const target = scope ?? memory.defaultScope();

        if (!(await memory.mayWrite(target))) return FORBIDDEN;

        const saved = await ctx.frogbot.memory.save({
          ...base,
          scope: target,
          text,
          ...(key === undefined ? {} : { key }),
          ...(pinned === undefined ? {} : { pinned }),
        });

        return `Saved ${line(saved).slice(2)}`;
      }),
  },
  {
    slug: 'memory_forget',
    label: 'Memory: Forget',
    description: 'Forget one memory by the id `memory_search` showed.',
    inputSchema: z.object({
      id: z.string().min(1).describe('The memory id'),
      scope: scopeInput,
    }),
    approval: approvalFor('memory_forget'),
    execute: ({ id, scope }, ctx) =>
      call(ctx, async ({ memory, base }) => {
        const target = scope ?? memory.defaultScope();

        if (!(await memory.mayWrite(target))) return FORBIDDEN;

        await ctx.frogbot.memory.forget({ ...base, scope: target, id });

        return `Forgot memory ${id}.`;
      }),
  },
];

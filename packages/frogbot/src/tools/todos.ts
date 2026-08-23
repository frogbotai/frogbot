import { z } from 'zod';

import type { Tool, ToolCtx } from '../types/tool.js';

export const TodoItem = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export type TodoItem = z.infer<typeof TodoItem>;

const writeTodosInput = z.object({ todos: z.array(TodoItem) });
const readTodosInput = z.object({});

function chat(ctx: ToolCtx): { id: number | string; slug: string } {
  const chat = ctx.req.frogbot.config.chat;
  if (!chat.enabled || ctx.agent.chatId === undefined) {
    throw new Error('[frogbot] Todo tools require chat persistence and a current chat.');
  }
  return { id: ctx.agent.chatId, slug: chat.chatsSlug };
}

export const write_todos: Tool<typeof writeTodosInput, void> = {
  slug: 'write_todos',
  description:
    'Replace the full todo list for the current chat. Keep exactly one todo in progress at a time and mark completed work promptly.',
  inputSchema: writeTodosInput,
  async execute({ todos }, ctx) {
    const current = chat(ctx);
    await ctx.req.frogbot.update({
      collection: current.slug,
      id: current.id,
      data: { todos },
      req: ctx.req,
      overrideAccess: true,
    });
  },
};

export const read_todos: Tool<typeof readTodosInput, TodoItem[]> = {
  slug: 'read_todos',
  description: 'Read the full todo list for the current chat.',
  inputSchema: readTodosInput,
  async execute(_, ctx) {
    const current = chat(ctx);
    const document = (await ctx.req.frogbot.findByID({
      collection: current.slug,
      id: current.id,
      depth: 0,
      req: ctx.req,
      overrideAccess: true,
    })) as { todos?: TodoItem[] | null };
    return document.todos ?? [];
  },
};

export const todoTools = [write_todos, read_todos];

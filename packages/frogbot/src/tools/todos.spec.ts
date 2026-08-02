import { describe, expect, it, vi } from 'vitest';

const modulePath = './todos.js';

async function loadTools() {
  return import(modulePath);
}

function makeCtx(...args: [] | [number | string | undefined]) {
  const threadId = args.length === 0 ? 'thread-1' : args[0];
  const update = vi.fn();
  const findByID = vi.fn().mockResolvedValue({ todos: [{ content: 'Ship it', status: 'completed' }] });
  const frogbot = {
    config: { chat: { enabled: true, threadsSlug: 'conversations' } },
    update,
    findByID,
  };
  return {
    ctx: {
      req: { frogbot },
      frogbot,
      agent: { slug: 'support', runId: 'run-1', threadId },
    },
    findByID,
    update,
  };
}

describe('todo tools', () => {
  it('overwrites the current thread todos', async () => {
    const { write_todos } = await loadTools();
    const { ctx, update } = makeCtx();
    const todos = [{ content: 'Ship it', status: 'in_progress' }];

    await write_todos.execute({ todos }, ctx as never);

    expect(update).toHaveBeenCalledWith({
      collection: 'conversations',
      id: 'thread-1',
      data: { todos },
      req: ctx.req,
      overrideAccess: true,
    });
  });

  it('rejects writes without a persisted thread', async () => {
    const { write_todos } = await loadTools();
    const { ctx, update } = makeCtx(undefined);

    await expect(write_todos.execute({ todos: [] }, ctx as never)).rejects.toThrow(/^\[frogbot\]/);
    expect(update).not.toHaveBeenCalled();
  });

  it('reads todos from the current thread', async () => {
    const { read_todos } = await loadTools();
    const { ctx, findByID } = makeCtx();

    await expect(read_todos.execute({}, ctx as never)).resolves.toEqual([
      { content: 'Ship it', status: 'completed' },
    ]);
    expect(findByID).toHaveBeenCalledWith({
      collection: 'conversations',
      id: 'thread-1',
      depth: 0,
      req: ctx.req,
      overrideAccess: true,
    });
  });

  it('returns an empty list for nullish stored todos', async () => {
    const { read_todos } = await loadTools();
    const { ctx, findByID } = makeCtx();
    findByID.mockResolvedValue({ todos: null });

    await expect(read_todos.execute({}, ctx as never)).resolves.toEqual([]);
  });

  it('rejects invalid todo statuses', async () => {
    const { write_todos } = await loadTools();
    expect(
      write_todos.inputSchema.safeParse({ todos: [{ content: 'Ship it', status: 'cancelled' }] }).success,
    ).toBe(false);
  });

  it('exports the write and read tools as a toolkit', async () => {
    const { todoTools, write_todos, read_todos } = await loadTools();
    expect(todoTools).toEqual([write_todos, read_todos]);
    for (const tool of todoTools) {
      expect(tool).toEqual(
        expect.objectContaining({
          slug: expect.any(String),
          description: expect.any(String),
          inputSchema: expect.any(Object),
          execute: expect.any(Function),
        }),
      );
    }
  });
});

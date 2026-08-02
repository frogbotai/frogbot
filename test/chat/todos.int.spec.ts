import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UIMessage } from 'frogbot';
import { resolveThreadContext } from 'frogbot/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { agentSlug, threadsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const toolsPath = 'frogbot/tools';

function userMessage(text: string, id: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] };
}

describe('chat persistence: todos', () => {
  let booted: BootedFrogbot;
  let owner: { id: number | string };

  beforeAll(async () => {
    booted = await bootFrogbot(dirname, 'chat-todos');
    owner = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'todo-owner@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    })) as { id: number | string };
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  async function exerciseTodos(req: Awaited<ReturnType<typeof booted.frogbot.createRequest>>, id: string) {
    const { write_todos, read_todos } = await import(toolsPath);
    const first = await resolveThreadContext({
      req,
      agentSlug,
      incoming: [userMessage('Create a plan', `${id}-1`)],
      tools: {},
    });
    const todos = [{ content: 'Complete the plan', status: 'in_progress' as const }];
    const ctx = {
      req,
      frogbot: booted.frogbot,
      agent: { slug: agentSlug, runId: id, threadId: first.threadId },
    };
    await write_todos.execute({ todos }, ctx);
    const continuation = await resolveThreadContext({
      req,
      agentSlug,
      threadId: first.threadId,
      incoming: [userMessage('Continue', `${id}-2`)],
      tools: {},
    });
    expect(continuation.threadId).toBe(first.threadId);
    await expect(read_todos.execute({}, ctx)).resolves.toEqual(todos);
    const thread = (await booted.frogbot.findByID({
      collection: threadsSlug,
      id: first.threadId!,
      depth: 0,
      overrideAccess: true,
    })) as { todos: unknown };
    expect(thread.todos).toEqual(todos);
    return first.threadId;
  }

  it('persists todos across an authenticated thread continuation', async () => {
    const req = await booted.frogbot.createRequest({ user: { ...owner, collection: usersSlug } } as never);
    await expect(exerciseTodos(req, 'authenticated')).resolves.toBeDefined();
  });

  it('persists todos across an anonymous thread continuation', async () => {
    await expect(exerciseTodos(await booted.frogbot.createRequest({}), 'anonymous')).resolves.toBeDefined();
  });
});

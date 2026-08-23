import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UIMessage } from 'frogbot';
import { resolveChatContext } from 'frogbot/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { agentSlug, chatsSlug, usersSlug } from './shared.js';

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

  async function exerciseTodos(
    req: Awaited<ReturnType<typeof booted.frogbot.createRequest>>,
    id: string,
  ) {
    const { write_todos, read_todos } = await import(toolsPath);
    const first = await resolveChatContext({
      req,
      agentSlug,
      incoming: [userMessage('Create a plan', `${id}-1`)],
      tools: {},
    });
    const todos = [{ content: 'Complete the plan', status: 'in_progress' as const }];
    const ctx = {
      req,
      frogbot: booted.frogbot,
      agent: { slug: agentSlug, runId: id, chatId: first.chatId },
    };
    await write_todos.execute({ todos }, ctx);
    const continuation = await resolveChatContext({
      req,
      agentSlug,
      chatId: first.chatId,
      incoming: [userMessage('Continue', `${id}-2`)],
      tools: {},
    });
    expect(continuation.chatId).toBe(first.chatId);
    await expect(read_todos.execute({}, ctx)).resolves.toEqual(todos);
    const chat = (await booted.frogbot.findByID({
      collection: chatsSlug,
      id: first.chatId!,
      depth: 0,
      overrideAccess: true,
    })) as { todos: unknown };
    expect(chat.todos).toEqual(todos);
    return first.chatId;
  }

  it('persists todos across an authenticated chat continuation', async () => {
    const req = await booted.frogbot.createRequest({
      user: { ...owner, collection: usersSlug },
    } as never);
    await expect(exerciseTodos(req, 'authenticated')).resolves.toBeDefined();
  });

  it('persists todos across an anonymous chat continuation', async () => {
    await expect(
      exerciseTodos(await booted.frogbot.createRequest({}), 'anonymous'),
    ).resolves.toBeDefined();
  });
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UIMessage } from 'frogbot';
import { resolveThreadContext } from 'frogbot/test';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { agentSlug, messagesSlug, threadsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function userMessage(text: string, id: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] };
}

describe('chat persistence: thread context', () => {
  let booted: BootedFrogbot;
  let owner: { id: number | string };

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);
    owner = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'owner@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    })) as { id: number | string };
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  async function makeOwnerReq() {
    return booted.frogbot.createRequest({ user: { ...owner, collection: usersSlug } } as never);
  }

  async function countDocs(collection: string) {
    const [threads, messages] = await Promise.all([
      booted.frogbot.count({ collection: threadsSlug, overrideAccess: true }),
      booted.frogbot.count({ collection: messagesSlug, overrideAccess: true }),
    ]);
    return collection === threadsSlug ? threads.totalDocs : messages.totalDocs;
  }

  it('creates a thread, persists the user message, and returns it as history', async () => {
    const req = await makeOwnerReq();
    const result = await resolveThreadContext({
      req,
      agentSlug,
      incoming: [userMessage('Hello there', 'u1')],
      tools: {},
    });

    expect(result.threadId).toBeDefined();

    const thread = (await booted.frogbot.findByID({
      collection: threadsSlug,
      id: result.threadId!,
      depth: 0,
      overrideAccess: true,
    })) as { agent: string; user: number | string };
    expect(thread.agent).toBe(agentSlug);
    expect(thread.user).toBe(owner.id);

    expect(result.uiMessages).toHaveLength(1);
    expect(result.uiMessages[0].parts).toEqual([{ type: 'text', text: 'Hello there' }]);
  });

  it('persists only the new message on follow-up turns and returns ordered history', async () => {
    const firstReq = await makeOwnerReq();
    const first = await resolveThreadContext({
      req: firstReq,
      agentSlug,
      incoming: [userMessage('First turn', 'u1')],
      tools: {},
    });

    const followUpReq = await makeOwnerReq();
    const followUp = await resolveThreadContext({
      req: followUpReq,
      agentSlug,
      threadId: first.threadId,
      incoming: [userMessage('Stale client message', 'u2'), userMessage('Second turn', 'u3')],
      tools: {},
    });

    expect(followUp.threadId).toBe(first.threadId);
    expect(followUp.uiMessages).toHaveLength(2);
    expect(followUp.uiMessages[0].parts).toEqual([{ type: 'text', text: 'First turn' }]);
    expect(followUp.uiMessages[1].parts).toEqual([{ type: 'text', text: 'Second turn' }]);
  });

  it('rejects a thread owned by another user', async () => {
    const req = await makeOwnerReq();
    const { threadId } = await resolveThreadContext({
      req,
      agentSlug,
      incoming: [userMessage('Mine', 'u1')],
      tools: {},
    });

    const intruder = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'intruder@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    })) as { id: number | string };
    const intruderReq = await booted.frogbot.createRequest({
      user: { ...intruder, collection: usersSlug },
    } as never);

    await expect(
      resolveThreadContext({
        req: intruderReq,
        agentSlug,
        threadId,
        incoming: [userMessage('Gimme', 'u2')],
        tools: {},
      }),
    ).rejects.toThrow();
  });

  it('rolls back the thread create when a message write fails (or degrades without transactions)', async () => {
    const txId = await booted.payload.db.beginTransaction();
    const supportsTransactions = txId !== null;
    if (txId) await booted.payload.db.rollbackTransaction(txId);

    const threadsBefore = await countDocs(threadsSlug);
    const messagesBefore = await countDocs(messagesSlug);

    const req = await makeOwnerReq();
    await expect(
      resolveThreadContext({
        req,
        agentSlug,
        incoming: [userMessage('Valid message', 'u1'), { id: 'u2', role: 'bogus', parts: [] } as never],
        tools: {},
      }),
    ).rejects.toThrow();

    if (supportsTransactions) {
      expect(await countDocs(threadsSlug)).toBe(threadsBefore);
      expect(await countDocs(messagesSlug)).toBe(messagesBefore);
    } else {
      expect(await countDocs(threadsSlug)).toBe(threadsBefore + 1);
      expect(await countDocs(messagesSlug)).toBe(messagesBefore + 1);
    }
  });
});

import type { FrogBotInstance } from 'frogbot';
import { databaseMemory, type MemoryAdapter } from 'frogbot/memory';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StubChatModel, StubChatRequest } from '../__helpers/shared/StubChatModel.js';
import { startStubChatModel } from '../__helpers/shared/StubChatModel.js';
import { createMemoryHarness } from './runtime.js';
import { chatModel, chatPort } from './shared.js';

type User = Awaited<ReturnType<ReturnType<typeof createMemoryHarness>['createUser']>>;

const agentSlug = 'helper';

const agents = [
  { slug: agentSlug, model: chatModel, instructions: 'Help the user.', memory: true },
  { slug: 'plain', model: chatModel, instructions: 'Plain.' },
] as never;

function systemText(request: StubChatRequest | undefined): string {
  const system = request?.messages.find(({ role }) => role === 'system');

  return typeof system?.content === 'string' ? system.content : JSON.stringify(system?.content);
}

function contents(request: StubChatRequest | undefined, role: string): string[] {
  return (request?.messages ?? [])
    .filter((message) => message.role === role)
    .map(({ content }) => (typeof content === 'string' ? content : JSON.stringify(content)));
}

describe('agent memory', () => {
  const afterTurn = vi.fn<NonNullable<MemoryAdapter['afterTurn']>>();
  const harness = createMemoryHarness({
    agents,
    memory: () => ({ ...databaseMemory(), afterTurn }),
  });

  let frogbot: FrogBotInstance;
  let model: StubChatModel;
  let sequence = 0;
  let user: User;

  async function chat(prompt: string, as: User = user) {
    const turn = (await frogbot.agents[agentSlug].streamMessage({
      req: await frogbot.createRequest({ user: as }),
      prompt,
      clientTools: { kinds: [], approval: true },
    } as never)) as { persistence: Promise<void> };

    await turn.persistence;
  }

  beforeAll(async () => {
    model = await startStubChatModel(chatPort);
    frogbot = await harness.boot();
  });

  afterAll(async () => {
    await model?.close();
    await harness.close();
  });

  beforeEach(async () => {
    model.reset();
    afterTurn.mockClear();
    user = await harness.createUser(`person-${++sequence}@frogbot.local`);
  });

  it('saves under the host-resolved scope and ignores a scope ID in the tool input', async () => {
    const other = await harness.createUser(`other-${sequence}@frogbot.local`);
    const otherScope = `me:users:${String(other.id)}`;

    model.respond(
      {
        toolCalls: [
          {
            id: 'call-save',
            name: 'memory_save',
            input: { text: 'Prefers email over phone.', scopeId: otherScope },
          },
          {
            id: 'call-forged',
            name: 'memory_save',
            input: { text: 'Planted fact.', scope: otherScope },
          },
        ],
      },
      { text: 'Noted.' },
    );

    await chat('Remember that I prefer email.');

    const mine = await frogbot.memory.list({ scope: 'me', user });
    const theirs = await frogbot.memory.list({ scope: 'me', user: other });

    expect(mine.docs.map(({ text }) => text)).toEqual(['Prefers email over phone.']);
    expect(theirs.docs).toEqual([]);
    expect(contents(model.requests[1], 'tool').join('\n')).toContain(
      `Memory invalid: Memory scope '${otherScope}' is not declared.`,
    );
  });

  it("skips memory.access on its own runs, which the app's default refuses for shared scopes", async () => {
    model.respond(
      {
        toolCalls: [
          {
            id: 'call-agent',
            name: 'memory_save',
            input: { text: 'Agent run fact.', scope: 'agent', key: 'own-run' },
          },
        ],
      },
      { text: 'Saved.' },
    );

    await chat('Remember this for everyone.');

    const { docs } = await frogbot.memory.list({ scope: 'agent', agent: agentSlug });

    expect(docs.map(({ text }) => text)).toContain('Agent run fact.');
    expect(contents(model.requests[1], 'tool').join('\n')).toContain('Saved [');
  });

  it('puts pinned memories in the system prompt and recalled ones before the last user message', async () => {
    await frogbot.memory.save({ scope: 'me', user, text: 'Call me Sam.', pinned: true });
    await frogbot.memory.save({ scope: 'agent', agent: agentSlug, text: 'Acme pays net 30.' });

    model.respond({ text: 'Hi Sam.' }, { text: 'Net 30.' });

    await chat('Hello there.');
    await chat('When does Acme pay?');

    const [first, second] = model.requests;

    expect(systemText(second)).toBe(systemText(first));
    expect(systemText(first)).toContain('Help the user.\n\n## Memory');
    expect(systemText(first)).toContain('Pinned memories:\n- Call me Sam.');
    expect(systemText(second)).not.toContain('Acme');

    const users = contents(second, 'user');

    expect(users.at(-1)).toContain('When does Acme pay?');
    expect(users.at(-2)).toMatch(
      /^<memories>\n- \[[^\]]+\] \(agent\) Acme pays net 30\.\n<\/memories>$/,
    );
    expect(contents(first, 'user').join('\n')).not.toContain('<memories>');
  });

  it('asks before memory_forget runs', async () => {
    const saved = await frogbot.memory.save({ scope: 'me', user, text: 'Lives in Lisbon.' });

    model.respond({
      toolCalls: [{ id: 'call-forget', name: 'memory_forget', input: { id: saved.id } }],
    });

    await chat('Forget where I live.');

    await expect(frogbot.memory.get({ scope: 'me', user, id: saved.id })).resolves.toMatchObject({
      text: 'Lives in Lisbon.',
    });
    expect(model.requests).toHaveLength(1);
  });

  it('gives memory tools only to the agent that opts in', () => {
    expect(Object.keys(frogbot.agents[agentSlug].aiAgent.tools)).toEqual([
      'memory_search',
      'memory_save',
      'memory_forget',
    ]);
    expect(Object.keys(frogbot.agents.plain.aiAgent.tools)).toEqual([]);
  });

  it('logs an afterTurn that throws, and the reply still finishes', async () => {
    afterTurn.mockImplementationOnce(() => {
      throw new Error('vendor down');
    });

    const error = vi.spyOn(frogbot.logger, 'error');

    model.respond({ text: 'Done.' });

    const result = await frogbot.agents[agentSlug].generate({
      req: await frogbot.createRequest({ user }),
      prompt: 'Hi.',
    });

    expect(result.text).toBe('Done.');

    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ message: 'vendor down' }) }),
        '[frogbot] Memory afterTurn failed.',
      ),
    );

    expect(afterTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: '',
        scopes: [
          { scope: 'me', scopeId: `me:users:${String(user.id)}` },
          { scope: 'agent', scopeId: `agent:${agentSlug}` },
          { scope: 'team', scopeId: 'team' },
        ],
      }),
    );

    const { messages } = afterTurn.mock.calls.at(-1)![0];

    expect(messages.at(-1)).toMatchObject({ role: 'assistant' });
  });
});

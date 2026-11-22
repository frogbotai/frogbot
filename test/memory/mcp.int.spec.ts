import type { FrogBotInstance } from 'frogbot';
import { databaseMemory, memoryTools } from 'frogbot/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMemoryHarness } from './runtime.js';
import { chatModel } from './shared.js';

function memoryTool(slug: string) {
  const execute = memoryTools.find((entry) => entry.slug === slug)?.execute;

  if (!execute) throw new Error(`No tool ${slug}`);

  return execute;
}

describe('memory tools outside an agent run', () => {
  const harness = createMemoryHarness({
    memory: () => databaseMemory({ access: { read: () => false, write: () => false } }),
  });

  let frogbot: FrogBotInstance;
  let sequence = 0;

  beforeAll(async () => {
    frogbot = await harness.boot();
  });

  afterAll(() => harness.close());

  async function run(slug: string, input: Record<string, unknown>, overrideAccess: boolean) {
    const user = await harness.createUser(`mcp-${++sequence}@frogbot.local`);
    const ctx = {
      req: await frogbot.createRequest({ user }),
      frogbot,
      agent: { slug: 'mcp', runId: 'run-1' },
      overrideAccess,
    };

    const execute = memoryTools.find((entry) => entry.slug === slug)?.execute;

    if (!execute) throw new Error(`No tool ${slug}`);

    return execute(input, ctx);
  }

  it('follows memory.access on shared scopes when the caller checks access, as MCP does', async () => {
    await frogbot.memory.save({ scope: 'team', text: 'Team launch code is 1234.' });

    await expect(
      run('memory_search', { query: 'launch code', scope: 'team' }, false),
    ).rejects.toThrow();
    await expect(
      run('memory_save', { text: 'Planted team fact.', scope: 'team' }, false),
    ).rejects.toThrow();

    const { docs } = await frogbot.memory.list({ scope: 'team' });

    expect(docs.map(({ text }) => text)).toEqual(['Team launch code is 1234.']);
  });

  it('skips memory.access for a trusted caller', async () => {
    await expect(
      run('memory_search', { query: 'launch code', scope: 'team' }, true),
    ).resolves.toContain('(team) Team launch code is 1234.');
  });

  it("searches only the caller's own scopes when no scope is given", async () => {
    const user = await harness.createUser(`mcp-${++sequence}@frogbot.local`);

    await frogbot.memory.save({ scope: 'me', user, text: 'Prefers oolong tea.' });

    const result = await memoryTool('memory_search')(
      { query: 'oolong' },
      {
        req: await frogbot.createRequest({ user }),
        frogbot,
        agent: { slug: 'mcp', runId: 'run-1' },
        overrideAccess: false,
      },
    );

    expect(result).toContain('(me) Prefers oolong tea.');
  });

  it('lets the signed-in person reach their own memories', async () => {
    await expect(run('memory_save', { text: 'Likes tea.', scope: 'me' }, false)).resolves.toMatch(
      /^Saved \[[^\]]+\] \(me\) Likes tea\.$/,
    );
  });
});

describe('memory tools outside an agent run, with an app agent slugged like the caller', () => {
  const harness = createMemoryHarness({
    agents: [{ slug: 'mcp', model: chatModel, instructions: 'MCP helper.', memory: true }] as never,
    memory: () => databaseMemory({ access: { read: () => false, write: () => false } }),
  });

  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    frogbot = await harness.boot();
  });

  afterAll(() => harness.close());

  it("keeps the caller's access check and doesn't resolve the agent scope", async () => {
    await frogbot.memory.save({ scope: 'team', text: 'Team launch code is 1234.' });

    const user = await harness.createUser('mcp-slug@frogbot.local');
    const ctx = {
      req: await frogbot.createRequest({ user }),
      frogbot,
      agent: { slug: 'mcp', runId: 'run-1' },
      overrideAccess: false,
    };

    await expect(
      memoryTool('memory_search')({ query: 'launch code', scope: 'team' }, ctx),
    ).rejects.toThrow();
    await expect(
      memoryTool('memory_save')({ text: 'Planted team fact.', scope: 'team' }, ctx),
    ).rejects.toThrow();
    await expect(
      memoryTool('memory_save')({ text: 'Agent fact.', scope: 'agent' }, ctx),
    ).resolves.toMatch(/^Memory invalid/);

    const { docs } = await frogbot.memory.list({ scope: 'team' });

    expect(docs.map(({ text }) => text)).toEqual(['Team launch code is 1234.']);
  });
});

import type { FrogBotInstance } from 'frogbot';
import { databaseMemory, memoryTools } from 'frogbot/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMemoryHarness } from './runtime.js';

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

  it('lets the signed-in person reach their own memories', async () => {
    await expect(run('memory_save', { text: 'Likes tea.', scope: 'me' }, false)).resolves.toMatch(
      /^Saved \[[^\]]+\] \(me\) Likes tea\.$/,
    );
  });
});

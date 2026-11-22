import type { FrogBotInstance } from 'frogbot';
import { databaseMemory } from 'frogbot/memory';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryHarness } from './runtime.js';

describe('databaseMemory cleanup', () => {
  const harness = createMemoryHarness({ memory: () => databaseMemory({ maxPerScope: 3 }) });
  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    frogbot = await harness.boot();
  });

  afterAll(() => harness.close());

  beforeEach(async () => {
    await frogbot.memory.forget({ scope: 'team' });
  });

  async function count() {
    const { docs } = await frogbot.memory.list({ scope: 'team' });

    return docs.length;
  }

  it('updates the memory with the same key', async () => {
    const first = await frogbot.memory.save({ scope: 'team', key: 'lunch', text: 'Lunch at noon' });
    const second = await frogbot.memory.save({ scope: 'team', key: 'lunch', text: 'Lunch at one' });

    expect(second).toMatchObject({ id: first.id, key: 'lunch', text: 'Lunch at one' });
    expect(await count()).toBe(1);
  });

  it('merges a near duplicate instead of adding one', async () => {
    const first = await frogbot.memory.save({
      scope: 'team',
      text: 'The client prefers email over phone calls for every project update and invoice',
    });

    const exact = await frogbot.memory.save({
      scope: 'team',
      text: 'the client prefers EMAIL over phone calls, for every project update and invoice!',
    });

    const near = await frogbot.memory.save({
      scope: 'team',
      text: 'The client prefers email over phone calls for every single project update and invoice',
    });

    expect(exact.id).toBe(first.id);
    expect(near.id).toBe(first.id);
    expect(near.text).toBe(
      'The client prefers email over phone calls for every single project update and invoice',
    );
    expect(await count()).toBe(1);
  });

  it('never merges a keyless save into a keyed memory', async () => {
    const keyed = await frogbot.memory.save({
      scope: 'team',
      key: 'contact',
      text: 'The client prefers email',
    });

    const exact = await frogbot.memory.save({ scope: 'team', text: 'The client prefers email' });

    const near = await frogbot.memory.save({
      scope: 'team',
      text: 'The client prefers email!',
    });

    expect(exact.id).not.toBe(keyed.id);
    expect(near.id).toBe(exact.id);
    expect(await frogbot.memory.get({ scope: 'team', id: keyed.id })).toMatchObject({
      key: 'contact',
      text: 'The client prefers email',
    });
    expect(await count()).toBe(2);
  });

  it('rejects text over 4,000 characters', async () => {
    await expect(
      frogbot.memory.save({ scope: 'team', text: 'a'.repeat(4_001) }),
    ).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('4000') });
    await expect(
      frogbot.memory.save({ scope: 'team', text: 'a'.repeat(4_000) }),
    ).resolves.toMatchObject({
      text: 'a'.repeat(4_000),
    });
  });

  it('keeps memories that only share some words', async () => {
    await frogbot.memory.save({ scope: 'team', text: 'The client prefers email' });
    await frogbot.memory.save({ scope: 'team', text: 'The client prefers mornings' });

    expect(await count()).toBe(2);
  });

  it('rejects pinned memories over the 2,000-token budget', async () => {
    await frogbot.memory.save({ scope: 'team', text: 'a'.repeat(4_000), pinned: true });
    await frogbot.memory.save({ scope: 'team', text: 'c'.repeat(2_000), pinned: true });

    await expect(
      frogbot.memory.save({ scope: 'team', text: 'b'.repeat(2_004), pinned: true }),
    ).rejects.toMatchObject({ name: 'MemoryAdapterError', code: 'limit' });

    const unpinned = await frogbot.memory.save({ scope: 'team', text: 'b'.repeat(2_004) });

    await expect(
      frogbot.memory.update({ scope: 'team', id: unpinned.id, pinned: true }),
    ).rejects.toMatchObject({ code: 'limit' });
  });

  it('keeps one memory per key under concurrent saves', async () => {
    const saved = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((text) =>
        frogbot.memory.save({ scope: 'team', key: 'k', text: `Value ${text}` }),
      ),
    );

    expect(new Set(saved.map(({ id }) => id)).size).toBe(1);
    expect(await count()).toBe(1);
  });

  it('keeps one memory under concurrent identical saves', async () => {
    await Promise.all(
      [1, 2, 3].map(() => frogbot.memory.save({ scope: 'team', text: 'Same fact' })),
    );

    expect(await count()).toBe(1);
  });

  it('holds the cap under concurrent saves', async () => {
    const results = await Promise.allSettled(
      ['Alpha one', 'Bravo two', 'Charlie three', 'Delta four', 'Echo five'].map((text) =>
        frogbot.memory.save({ scope: 'team', text }),
      ),
    );

    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(2);
    expect(await count()).toBe(3);
  });

  it('rejects a text change that would repeat another memory', async () => {
    await frogbot.memory.save({ scope: 'team', text: 'Coffee at nine' });

    const other = await frogbot.memory.save({ scope: 'team', text: 'Standup at ten' });

    await expect(
      frogbot.memory.update({ scope: 'team', id: other.id, text: 'coffee at nine!' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rejects saves past the per-scope cap', async () => {
    for (const text of ['Alpha one', 'Bravo two', 'Charlie three']) {
      await frogbot.memory.save({ scope: 'team', text });
    }

    await expect(frogbot.memory.save({ scope: 'team', text: 'Delta four' })).rejects.toMatchObject({
      code: 'limit',
    });

    const updated = await frogbot.memory.save({ scope: 'team', text: 'alpha one!' });

    expect(updated.text).toBe('alpha one!');
    expect(await count()).toBe(3);
  });
});

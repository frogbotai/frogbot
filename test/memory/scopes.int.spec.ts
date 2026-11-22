import type { FrogBotInstance } from 'frogbot';
import { databaseMemory } from 'frogbot/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMemoryHarness } from './runtime.js';

describe('memory custom scopes', () => {
  const harness = createMemoryHarness({
    memory: () =>
      databaseMemory({ scopes: { client: ({ chat }) => chat?.client as number | string } }),
  });

  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    frogbot = await harness.boot();
  });

  afterAll(() => harness.close());

  it('rejects a scope value that is an object, so clients never share one scope', async () => {
    const acme = { scope: 'client', chat: { client: { id: 'acme' } } };
    const globex = { scope: 'client', chat: { client: { id: 'globex' } } };

    await expect(
      frogbot.memory.save({ ...acme, text: 'Acme contract renews in March' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(frogbot.memory.list(globex)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rejects a scope value that is not a finite number', async () => {
    await expect(
      frogbot.memory.list({ scope: 'client', chat: { client: Number.NaN } }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('keeps one scope per value, number or string', async () => {
    await frogbot.memory.save({ scope: 'client', chat: { client: 7 }, text: 'Seven pays late' });

    await frogbot.memory.save({
      scope: 'client',
      chat: { client: 'acme' },
      text: 'Acme pays early',
    });

    const seven = await frogbot.memory.list({ scope: 'client', chat: { client: 7 } });

    expect(seven.docs.map(({ text }) => text)).toEqual(['Seven pays late']);
  });
});

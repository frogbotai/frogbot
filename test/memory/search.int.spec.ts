import type { FrogBotInstance } from 'frogbot';
import { databaseMemory } from 'frogbot/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StubEmbeddingModel } from '../__helpers/shared/StubEmbeddingModel.js';
import { startStubEmbeddingModel } from '../__helpers/shared/StubEmbeddingModel.js';
import { createMemoryHarness, database } from './runtime.js';
import { dimensions, embeddingModel, modelPort } from './shared.js';

const email = 'The client prefers email';
const billing = 'Invoices go out on Fridays';
const paraphrase = 'How should I contact them?';

describe(`memory search without AI (${database})`, () => {
  const harness = createMemoryHarness({
    memory: () => databaseMemory({ scopes: { client: ({ chat }) => chat?.client as string } }),
  });

  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    frogbot = await harness.boot();

    for (const text of [email, billing, 'Standups are at ten']) {
      await frogbot.memory.save({ scope: 'team', text });
    }

    await frogbot.memory.save({ scope: 'team', key: 'tone', text: 'Write formally' });
  });

  afterAll(() => harness.close());

  it('finds a memory by a word in it, ranked first', async () => {
    const hits = await frogbot.memory.search({ scope: 'team', query: 'Email please' });

    expect(hits[0]?.memory.text).toBe(email);
    expect(hits.map(({ memory }) => memory.text)).not.toContain('Standups are at ten');
  });

  it('finds a memory by its key', async () => {
    const hits = await frogbot.memory.search({ scope: 'team', query: 'tone' });

    expect(hits.map(({ memory }) => memory.key)).toContain('tone');
  });

  it('stays inside the scope', async () => {
    const owner = await harness.createUser('search-owner@frogbot.test');

    await frogbot.memory.save({ scope: 'me', user: owner, text: 'Email is my favorite' });

    const team = await frogbot.memory.search({ scope: 'team', query: 'favorite' });
    const mine = await frogbot.memory.search({ scope: 'me', user: owner, query: 'favorite' });

    expect(team).toEqual([]);
    expect(mine.map(({ memory }) => memory.text)).toEqual(['Email is my favorite']);
  });

  it('ranks the best match first in a large scope, however old it is', async () => {
    const big = { scope: 'client', chat: { client: 'big' } };

    await frogbot.memory.save({ ...big, text: 'Client email is ops@acme.test' });

    for (let index = 0; index < 600; index++) {
      await frogbot.memory.save({ ...big, key: `n${index}`, text: `Standup notes ${index}` });
    }

    const hits = await frogbot.memory.search({ ...big, query: "What's the client's email?" });

    expect(hits[0]?.memory.text).toBe('Client email is ops@acme.test');
  }, 120_000);

  it('returns nothing for a query with no matching words', async () => {
    expect(await frogbot.memory.search({ scope: 'team', query: 'zebra' })).toEqual([]);
  });
});

describe.skipIf(database === 'mongodb')('memory search by meaning', () => {
  const harness = createMemoryHarness({
    memory: () => databaseMemory({ embeddingModel, dimensions }),
  });

  let frogbot: FrogBotInstance;
  let model: StubEmbeddingModel;

  beforeAll(async () => {
    model = await startStubEmbeddingModel({
      dimensions,
      port: modelPort,
      vectors: { [email]: [1, 0, 0], [billing]: [0, 1, 0], [paraphrase]: [0.9, 0.1, 0] },
    });

    frogbot = await harness.boot();

    await frogbot.memory.save({ scope: 'team', text: billing });
    await frogbot.memory.save({ scope: 'team', text: email });
  });

  afterAll(async () => {
    await harness.close();
    await model?.close();
  });

  it('finds a memory from a paraphrase that shares no words with it', async () => {
    const hits = await frogbot.memory.search({ scope: 'team', query: paraphrase });

    expect(hits[0]?.memory.text).toBe(email);
    expect(model.requests.at(-1)?.input).toEqual([paraphrase]);
  });
});

import type { FrogBotInstance } from 'frogbot';
import { databaseMemory, type MemoryAdapter, type MemoryTarget } from 'frogbot/memory';
import { testMemoryAdapter } from 'frogbot/memory/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StubEmbeddingModel } from '../__helpers/shared/StubEmbeddingModel.js';
import { startStubEmbeddingModel } from '../__helpers/shared/StubEmbeddingModel.js';
import { createMemoryHarness, database } from './runtime.js';
import { dimensions, embeddingModel, modelPort } from './shared.js';

const overBudget = 'word '.repeat(2_000);

async function duplicateKey(adapter: MemoryAdapter, target: MemoryTarget) {
  await adapter.save({ ...target, key: 'first', text: 'Coffee at nine' });

  const second = await adapter.save({ ...target, key: 'second', text: 'Standup at ten' });

  return adapter.update({ ...target, id: second.id, key: 'first' });
}

describe('testMemoryAdapter(databaseMemory())', () => {
  const adapter = databaseMemory();
  const harness = createMemoryHarness({ memory: () => adapter });
  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    frogbot = await harness.boot();
  });

  afterAll(() => harness.close());

  it('passes the adapter kit', async () => {
    const run = testMemoryAdapter(adapter, {
      req: await frogbot.createRequest(),
      errors: {
        'memory.pinned-budget': (target) =>
          adapter.save({ ...target, text: overBudget, pinned: true }),
        'memory.duplicate': (target) => duplicateKey(adapter, target),
      },
    });

    await expect(run).resolves.toBeUndefined();
  });
});

describe.skipIf(database === 'mongodb')(
  'testMemoryAdapter(databaseMemory({ embeddingModel }))',
  () => {
    const adapter = databaseMemory({ embeddingModel, dimensions });
    const harness = createMemoryHarness({ memory: () => adapter });
    let frogbot: FrogBotInstance;
    let model: StubEmbeddingModel;

    beforeAll(async () => {
      model = await startStubEmbeddingModel({ dimensions, port: modelPort });
      frogbot = await harness.boot();
    });

    afterAll(async () => {
      await harness.close();
      await model?.close();
    });

    it('passes the adapter kit, and fails with unavailable when the model does', async () => {
      const run = testMemoryAdapter(adapter, {
        req: await frogbot.createRequest(),
        errors: {
          'memory.unavailable': (target) => {
            model.respond({
              error: { status: 400, body: { error: { message: 'provider down' } } },
            });

            return adapter.save({ ...target, text: 'Saved while the model is down' });
          },
        },
      });

      await expect(run).resolves.toBeUndefined();
    });
  },
);

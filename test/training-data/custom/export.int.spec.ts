import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TrainingDataRecord } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../../__helpers/shared/bootFrogbot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('training data export: custom chat collections', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname, 'training-data-custom');

    const thread = (await booted.frogbot.create({
      collection: 'conversations',
      data: { title: 'custom' },
      overrideAccess: true,
    })) as { id: number | string };

    await booted.frogbot.create({
      collection: 'turns',
      data: {
        id: 't1',
        role: 'user',
        parts: [{ type: 'text', text: 'custom slug' }],
        thread: thread.id,
      },
      overrideAccess: true,
    });
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('exports from the marked thread and message collections', async () => {
    const chunks: Buffer[] = [];
    const reader = booted.frogbot.exportTrainingData({ overrideAccess: true }).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }

    const lines = Buffer.concat(chunks).toString('utf-8').trimEnd().split('\n');
    const records = lines.map((line) => JSON.parse(line) as TrainingDataRecord);

    expect(records).toHaveLength(1);
    expect(records[0].thread).toMatchObject({ title: 'custom' });
    expect(records[0].messages[0].parts).toEqual([{ type: 'text', text: 'custom slug' }]);
  });
});

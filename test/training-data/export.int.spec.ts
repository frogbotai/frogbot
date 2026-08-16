import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TrainingDataRecord } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { messagesSlug, threadsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const imagePart = { type: 'file', mediaType: 'image/png', url: 'https://cdn.test/a.png' };
const videoPart = { type: 'file', mediaType: 'video/mp4', url: 'https://cdn.test/a.mp4' };
const filePart = { type: 'file', mediaType: 'application/pdf', url: 'https://cdn.test/a.pdf' };
const reasoningPart = { type: 'reasoning', text: 'thinking carefully' };
const toolCallPart = {
  type: 'tool-lookup',
  toolCallId: 'call-1',
  state: 'output-available',
  input: { query: 'weather', nested: { deep: [1, 2, 3] } },
  output: { temperature: 21 },
};
const unknownPart = { type: 'future-part-v9', payload: { anything: true, list: [null, 'x'] } };

async function readRecords(stream: ReadableStream<Uint8Array>): Promise<TrainingDataRecord[]> {
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks).toString('utf-8');
  if (text === '') return [];
  return text
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line) as TrainingDataRecord);
}

describe('training data export', () => {
  let booted: BootedFrogbot;
  let owner: { id: number | string };
  let otherUser: { id: number | string };
  let exportedThreadId: number | string;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);

    owner = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'owner@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    })) as { id: number | string };
    otherUser = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'other@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    })) as { id: number | string };

    const exported = (await booted.frogbot.create({
      collection: threadsSlug,
      data: { title: 'exported', agent: 'support', user: owner.id },
      overrideAccess: true,
    })) as { id: number | string };
    exportedThreadId = exported.id;

    const excluded = (await booted.frogbot.create({
      collection: threadsSlug,
      data: { title: 'excluded', agent: 'other', user: otherUser.id },
      overrideAccess: true,
    })) as { id: number | string };

    const messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }, imagePart] },
      { id: 'm2', role: 'assistant', parts: [reasoningPart, toolCallPart] },
      { id: 'm3', role: 'user', parts: [videoPart, filePart] },
      { id: 'm4', role: 'assistant', parts: [unknownPart], metadata: { custom: { a: 1 } } },
    ];
    for (const message of messages) {
      await booted.frogbot.create({
        collection: messagesSlug,
        data: { ...message, thread: exportedThreadId },
        overrideAccess: true,
      });
    }

    await booted.frogbot.create({
      collection: messagesSlug,
      data: {
        id: 'x1',
        role: 'user',
        parts: [{ type: 'text', text: 'excluded' }],
        thread: excluded.id,
      },
      overrideAccess: true,
    });
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('exports filtered conversations losslessly as ordered JSONL', async () => {
    const records = await readRecords(
      booted.frogbot.exportTrainingData({
        where: { agent: { equals: 'support' } },
        overrideAccess: true,
      }),
    );

    expect(records).toHaveLength(1);
    expect(records[0].thread).toMatchObject({ id: exportedThreadId, title: 'exported' });
    expect(records[0].messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(records[0].messages.map((message) => message.parts)).toEqual([
      [{ type: 'text', text: 'Hello' }, imagePart],
      [reasoningPart, toolCallPart],
      [videoPart, filePart],
      [unknownPart],
    ]);
    expect(records[0].messages[3].metadata).toEqual({ custom: { a: 1 } });
  });

  it('exports every conversation when unfiltered', async () => {
    const records = await readRecords(booted.frogbot.exportTrainingData({ overrideAccess: true }));

    expect(records.map((record) => record.thread.title).sort()).toEqual(['excluded', 'exported']);
  });

  it('returns identical output across page sizes', async () => {
    const [single, batched] = await Promise.all([
      readRecords(booted.frogbot.exportTrainingData({ pageSize: 1, overrideAccess: true })),
      readRecords(booted.frogbot.exportTrainingData({ pageSize: 100, overrideAccess: true })),
    ]);

    expect(single).toEqual(batched);
  });

  it('respects collection access for the requesting user', async () => {
    const req = await booted.frogbot.createRequest({
      user: { ...owner, collection: usersSlug },
    } as never);

    const records = await readRecords(booted.frogbot.exportTrainingData({ req }));

    expect(records).toHaveLength(1);
    expect(records[0].thread.id).toBe(exportedThreadId);
  });

  it('surfaces access denial instead of exporting silently', async () => {
    const req = await booted.frogbot.createRequest({});

    await expect(readRecords(booted.frogbot.exportTrainingData({ req }))).rejects.toThrow(
      'You are not allowed to perform this action',
    );
  });
});

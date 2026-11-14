import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FormDocument } from '@frogbotai/plugin-forms';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { ticketFilesSlug, ticketsSlug } from '../shared.js';
import { infectedMarker, staticDir } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';
const MiB = 1024 * 1024;

type Ticket = {
  id: number | string;
  subject: string;
  screenshot?: number | string | null;
  attachments?: (number | string)[] | null;
};

type StoredFile = {
  id: number | string;
  filename: string;
  filesize: number;
  mimeType: string;
  note?: string | null;
};

type Part = { key: string; name: string; type: string; data: Uint8Array | string };

const text = (key: string, name: string, data = 'hello'): Part => ({
  key,
  name,
  type: 'text/plain',
  data,
});

describe(`forms plugin uploads [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-forms-uploads');
  });

  afterAll(async () => {
    await booted.shutdown();
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await fs.rm(staticDir, { recursive: true, force: true });

    await booted.frogbot.create({
      collection: 'forms',
      data: {
        title: 'Open a ticket',
        slug: 'support',
        collection: ticketsSlug,
        steps: [
          {
            questions: [
              { field: 'subject' },
              { field: 'screenshot', maxFileSize: 50 * MiB },
              { field: 'attachments', maxFiles: 2, maxFileSize: MiB, mimeTypes: ['text/*'] },
            ],
          },
        ],
      } satisfies Omit<FormDocument, 'id'>,
      overrideAccess: true,
    });
  });

  async function submit(data: Record<string, unknown>, parts: Part[] = []) {
    const body = new FormData();

    body.set('_payload', JSON.stringify({ data }));

    for (const part of parts) {
      const bytes = typeof part.data === 'string' ? part.data : new Uint8Array(part.data);

      body.append(part.key, new Blob([bytes], { type: part.type }), part.name);
    }

    const response = await fetch(`${booted.baseUrl}/api/forms/support/submit`, {
      method: 'POST',
      body,
    });

    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function tickets(): Promise<Ticket[]> {
    const result = await booted.frogbot.find({
      collection: ticketsSlug,
      overrideAccess: true,
      pagination: false,
      depth: 0,
    });

    return result.docs as unknown as Ticket[];
  }

  async function storedFiles(): Promise<StoredFile[]> {
    const result = await booted.frogbot.find({
      collection: ticketFilesSlug,
      overrideAccess: true,
      pagination: false,
    });

    return result.docs as unknown as StoredFile[];
  }

  async function filesOnDisk(): Promise<string[]> {
    return fs.readdir(staticDir).catch(() => []);
  }

  it('takes a 50 MB file when the app raises its upload limits, and returns no file', async () => {
    const big = new Uint8Array(50 * MiB);
    const result = await submit({ subject: 'Crash on save' }, [
      { key: 'screenshot', name: 'recording.bin', type: 'application/octet-stream', data: big },
    ]);

    expect(result).toEqual({
      status: 200,
      body: {
        confirmation: { type: 'message', message: 'Thanks, your response has been sent.' },
      },
    });

    const [file] = await storedFiles();

    expect(file).toMatchObject({
      filename: expect.stringMatching(/^recording/),
      filesize: 50 * MiB,
      note: 'scanned',
    });
    expect(await tickets()).toEqual([
      expect.objectContaining({ subject: 'Crash on save', screenshot: file?.id }),
    ]);
  });

  it('keeps files private: a signed-out visitor cannot read them', async () => {
    const result = await submit({ subject: 'Invoice question' }, [
      text('attachments', 'invoice.txt'),
      text('attachments', 'receipt.txt'),
    ]);

    expect(result.status).toBe(200);

    const files = await storedFiles();
    const [ticket] = await tickets();

    expect(ticket?.attachments).toHaveLength(2);
    expect(new Set(ticket?.attachments)).toEqual(new Set(files.map(({ id }) => id)));

    for (const file of files) {
      const byId = await booted.restClient.get(`/api/${ticketFilesSlug}/${file.id}`);
      const download = await fetch(
        `${booted.baseUrl}/api/${ticketFilesSlug}/file/${encodeURIComponent(file.filename)}`,
      );

      expect(byId.status).toBe(403);
      expect(download.status).toBe(403);
    }
  });

  it('refuses a file ID in place of a file', async () => {
    const existing = await booted.frogbot.create({
      collection: ticketFilesSlug,
      data: {},
      file: { data: Buffer.from('old'), mimetype: 'text/plain', name: 'old.txt', size: 3 },
      overrideAccess: true,
    });

    const result = await submit({ subject: 'Reuse a file', screenshot: existing.id });

    expect(result).toEqual({
      status: 400,
      body: {
        errors: [
          { field: 'screenshot', message: "Attach the file itself. File IDs aren't accepted." },
        ],
      },
    });
    expect(await tickets()).toEqual([]);
  });

  it('keeps no files when the scanning hook throws on one of them', async () => {
    const result = await submit({ subject: 'Two files' }, [
      text('attachments', 'clean.txt'),
      text('attachments', 'infected.txt', infectedMarker),
    ]);

    expect(result).toEqual({
      status: 400,
      body: { errors: [{ field: 'attachments', message: 'This file failed a virus scan.' }] },
    });
    expect(await storedFiles()).toEqual([]);
    expect(await filesOnDisk()).toEqual([]);
    expect(await tickets()).toEqual([]);
  });

  it('keeps no files when the record fails validation', async () => {
    const result = await submit({ subject: 'x' }, [
      text('screenshot', 'screen.txt'),
      text('attachments', 'log.txt'),
    ]);

    expect(result).toEqual({
      status: 400,
      body: { errors: [expect.objectContaining({ field: 'subject' })] },
    });
    expect(await storedFiles()).toEqual([]);
    expect(await filesOnDisk()).toEqual([]);
  });

  it("checks each question's count, size and type before saving anything", async () => {
    const tooMany = await submit({ subject: 'Many files' }, [
      text('attachments', 'a.txt'),
      text('attachments', 'b.txt'),
      text('attachments', 'c.txt'),
    ]);

    expect(tooMany).toEqual({
      status: 400,
      body: { errors: [{ field: 'attachments', message: 'Attach up to 2 files.' }] },
    });

    const wrongType = await submit({ subject: 'A PDF' }, [
      { key: 'attachments', name: 'report.pdf', type: 'application/pdf', data: '%PDF-1.4' },
    ]);

    expect(wrongType).toEqual({
      status: 400,
      body: {
        errors: [
          { field: 'attachments', message: '"report.pdf" isn\'t an accepted type (text/*).' },
        ],
      },
    });

    const tooBig = await submit({ subject: 'Big log' }, [
      text('attachments', 'big.txt', 'x'.repeat(MiB + 1)),
    ]);

    expect(tooBig).toEqual({
      status: 400,
      body: { errors: [{ field: 'attachments', message: '"big.txt" is larger than 1 MB.' }] },
    });

    expect(await storedFiles()).toEqual([]);
    expect(await tickets()).toEqual([]);
  });

  it("answers 413 for more files than the app's upload limits allow", async () => {
    const result = await submit({ subject: 'Too many' }, [
      text('screenshot', 'a.txt'),
      text('attachments', 'b.txt'),
      text('attachments', 'c.txt'),
      text('other', 'd.txt'),
    ]);

    expect(result).toEqual({
      status: 413,
      body: { error: 'The files are too large, or there are too many.' },
    });
    expect(await storedFiles()).toEqual([]);
  });

  it('ignores file parts that are not questions on the form', async () => {
    const result = await submit({ subject: 'Stray part' }, [text('other', 'stray.txt')]);

    expect(result.status).toBe(200);
    expect(await storedFiles()).toEqual([]);
    expect(await tickets()).toEqual([expect.objectContaining({ subject: 'Stray part' })]);
  });

  it('neither checks nor keeps the files of a hidden question', async () => {
    await booted.frogbot.update({
      collection: 'forms',
      where: { slug: { equals: 'support' } },
      data: {
        steps: [
          {
            questions: [
              { field: 'subject' },
              {
                field: 'attachments',
                mimeTypes: ['text/*'],
                rules: [{ question: 'subject', operator: 'equals', value: 'Bug report' }],
              },
            ],
          },
        ],
      },
      overrideAccess: true,
    });

    const hidden = await submit({ subject: 'Question' }, [
      { key: 'attachments', name: 'photo.png', type: 'image/png', data: 'png' },
    ]);

    expect(hidden.status).toBe(200);
    expect(await storedFiles()).toEqual([]);
    expect((await tickets())[0]?.attachments ?? []).toEqual([]);

    const shown = await submit({ subject: 'Bug report' }, [
      { key: 'attachments', name: 'photo.png', type: 'image/png', data: 'png' },
    ]);

    expect(shown.status).toBe(400);
  });
});

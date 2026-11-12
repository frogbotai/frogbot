import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { signIn } from './harness.js';
import { companiesSlug, importsDir, notesSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Session = Awaited<ReturnType<typeof signIn>>;

describe('exports of versioned collections without drafts', () => {
  let booted: BootedFrogBot;
  let ana: Session;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-import-export-export');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    ana = await signIn(booted, 'ana@export.test');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(importsDir, { recursive: true, force: true });
  });

  function download(collectionSlug: string, format = 'csv') {
    return booted.restClient.post<unknown>(
      '/api/exports/download',
      { data: { collectionSlug, format } },
      { headers: ana.headers, signal: AbortSignal.timeout(10_000) },
    );
  }

  it('downloads a CSV of every document', async () => {
    await booted.frogbot.create({
      collection: companiesSlug,
      data: { name: 'Globex' },
      overrideAccess: true,
    });

    const { body, status } = await download(companiesSlug);

    expect(status).toBe(200);
    expect(String(body)).toContain('Globex');
  });

  it('saves an export that runs at once', async () => {
    await booted.frogbot.create({
      collection: notesSlug,
      data: { title: 'Kickoff' },
      overrideAccess: true,
    });

    const saved = await booted.frogbot.create({
      collection: 'exports',
      data: { collectionSlug: notesSlug, format: 'json' },
      user: ana.user,
      overrideAccess: false,
    } as never);

    expect(saved).toMatchObject({ collectionSlug: notesSlug });
  });

  it('previews the rows an export will hold', async () => {
    await booted.frogbot.create({
      collection: companiesSlug,
      data: { name: 'Globex' },
      overrideAccess: true,
    });

    const { body, status } = await booted.restClient.post<unknown>(
      '/api/exports/export-preview',
      { collectionSlug: companiesSlug, format: 'csv' },
      { headers: ana.headers, signal: AbortSignal.timeout(10_000) },
    );

    expect(status).toBe(200);
    expect(JSON.stringify(body)).toContain('Globex');
  });

  it('refuses to download a collection the export collection does not serve', async () => {
    const { body, status } = await download(usersSlug);

    expect(status).toBe(400);
    expect(JSON.stringify(body)).not.toContain('ana@export.test');
  });
});

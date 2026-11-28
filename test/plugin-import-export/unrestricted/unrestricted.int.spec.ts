import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { csv, signIn } from '../harness.js';
import { importsDir, importsSlug } from '../shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('importExportPlugin with an empty `collections` option', () => {
  let booted: BootedFrogBot;
  let headers: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-import-export-unrestricted');
    await clearAndSeed(booted.frogbot, 'empty');
    ({ headers } = await signIn(booted, 'ana@import.test'));
  });

  afterAll(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.shutdown();
    await rm(importsDir, { recursive: true, force: true });
  });

  it('refuses an unknown collection without listing every collection in the app', async () => {
    const response = await booted.restClient.post(
      `/api/${importsSlug}/import-columns`,
      { collectionSlug: 'nope', fileData: csv([['Name']]).toString('base64'), format: 'csv' },
      { headers },
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'import-export.collection-not-importable',
      detail: `Collection "nope" can't be imported here.`,
    });
  });
});

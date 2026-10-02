import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { CollectionSlug } from 'frogbot';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { isServiceReachable, storageServices } from '../__helpers/shared/storage/storageServices';
import { bucket, chatAssetsSlug, filesSlug, s3ClientConfig } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('s3 storage for built-in collections', () => {
  const client = new S3Client(s3ClientConfig);
  const created: { collection: CollectionSlug; id: number | string }[] = [];
  let booted: BootedFrogBot | undefined;

  async function upload(collection: CollectionSlug) {
    const data = Buffer.from(`stored in ${collection}`);

    const doc = await booted!.frogbot.create({
      collection,
      data: {},
      file: { data, mimetype: 'text/plain', name: `${randomUUID()}.txt`, size: data.length },
      overrideAccess: true,
    });

    created.push({ collection, id: doc.id });

    return doc as { filename: string };
  }

  beforeAll(async () => {
    const service = storageServices.s3;

    if (await isServiceReachable(service)) {
      booted = await bootFrogBot(dirname, 'storage-s3-builtins');

      return;
    }

    if (process.env.CI === 'true') {
      throw new Error(`${service.name} is required in CI but is not reachable.`);
    }

    console.warn(
      `\x1b[33m⚠ Skipping s3 built-in collection tests — ${service.name} not reachable. ` +
        `Start with: docker compose -f test/docker-compose.yml --profile storage up -d\x1b[0m`,
    );
  });

  afterAll(async () => {
    client.destroy();

    if (booted) await booted.shutdown();
  });

  beforeEach(async (ctx) => {
    if (!booted) {
      ctx.skip();

      return;
    }

    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    for (const { collection, id } of created.splice(0)) {
      await booted!.frogbot.delete({ collection, id, overrideAccess: true });
    }
  });

  it('stores uploads to the default files collection in the bucket', async () => {
    const { filename } = await upload(filesSlug);

    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: filename }));

    expect(object.ContentType).toBe('text/plain');
  });

  it('stores uploads to frogbot-chat-assets in the bucket', async () => {
    const { filename } = await upload(chatAssetsSlug);

    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: filename }));

    expect(object.ContentType).toBe('text/plain');
  });
});

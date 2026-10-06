import type * as PayloadModule from 'payload';
import { describe, expect, it, vi } from 'vitest';

import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import type { Plugin } from '../../../../packages/frogbot/src/plugin.js';
import { azureStorage } from '../../../../packages/storage-azure/src/index.js';
import { gcsStorage } from '../../../../packages/storage-gcs/src/index.js';
import { r2Storage } from '../../../../packages/storage-r2/src/index.js';
import { s3Storage } from '../../../../packages/storage-s3/src/index.js';
import { uploadthingStorage } from '../../../../packages/storage-uploadthing/src/index.js';
import { vercelBlobStorage } from '../../../../packages/storage-vercel-blob/src/index.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
  handleEndpoints: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/getFrogBot.js', () => ({
  getCachedFrogBot: vi.fn(() => null),
  seedFrogBotCache: vi.fn(),
}));

const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');

const chatAssetsSlug = 'frogbot-chat-assets';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};

const Chats: CollectionConfig = { slug: 'chats', chat: true, fields: [] };

const Media: CollectionConfig = { slug: 'media', upload: true, fields: [] };

const Files: CollectionConfig = { slug: 'files', file: true, fields: [] };

const s3 = (options: Partial<Parameters<typeof s3Storage>[0]> = {}) =>
  s3Storage({ bucket: 'bucket', config: { region: 'us-east-1' }, ...options });

const gcs = (options: Partial<Parameters<typeof gcsStorage>[0]> = {}) =>
  gcsStorage({ bucket: 'bucket', options: {}, ...options });

type UploadShape = { adapter?: string; disableLocalStorage?: boolean };

type ProviderShape = { clientProps?: { collectionSlug?: string } };

async function build(overrides: Partial<FrogBotConfig>) {
  const sanitized = await buildConfig({
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [Users, Files],
    ...overrides,
  });

  const payloadConfig = (await sanitized._internal.payloadConfig) as unknown as {
    admin?: { components?: { providers?: ProviderShape[] } };
    collections: { slug: string; upload?: UploadShape | boolean }[];
  };

  const upload = (slug: string): UploadShape | undefined => {
    const collection = payloadConfig.collections.find((entry) => entry.slug === slug);

    if (!collection) throw new Error(`Collection '${slug}' is missing.`);

    return typeof collection.upload === 'object' ? collection.upload : undefined;
  };

  const clientUploadSlugs = (payloadConfig.admin?.components?.providers ?? []).flatMap(
    (provider) =>
      provider.clientProps?.collectionSlug ? [provider.clientProps.collectionSlug] : [],
  );

  return { sanitized, payloadConfig, upload, clientUploadSlugs };
}

describe('storage adapters', () => {
  it('cover the files collection and chat assets without listing them', async () => {
    const { upload } = await build({ collections: [Users, Files, Chats], plugins: [s3()] });

    expect(upload('files')).toMatchObject({ adapter: 's3', disableLocalStorage: true });
    expect(upload(chatAssetsSlug)).toMatchObject({ adapter: 's3', disableLocalStorage: true });
  });

  it('cover collections added by plugins that run after the adapter', async () => {
    const addMedia: Plugin = (config) => ({
      ...config,
      collections: [...config.collections, Media],
    });

    const { upload } = await build({
      plugins: [s3({ collections: { media: true } }), addMedia],
    });

    expect(upload('media')).toMatchObject({ adapter: 's3' });
    expect(upload('files')).toMatchObject({ adapter: 's3' });
  });

  it('cover the collection marked `file: true` instead of `files`', async () => {
    const Documents: CollectionConfig = { slug: 'documents', file: true, upload: true, fields: [] };

    const { payloadConfig, upload } = await build({
      collections: [Users, Documents],
      plugins: [s3()],
    });

    expect(upload('documents')).toMatchObject({ adapter: 's3', disableLocalStorage: true });
    expect(payloadConfig.collections.map(({ slug }) => slug)).not.toContain('files');
  });

  it('leave a built-in collection on local disk when it is set to false', async () => {
    const { upload, clientUploadSlugs } = await build({
      collections: [Users, Files, Chats],
      plugins: [s3({ collections: { [chatAssetsSlug]: false } })],
    });

    expect(upload('files')).toMatchObject({ adapter: 's3' });
    expect(upload(chatAssetsSlug)?.adapter).toBeUndefined();
    expect(clientUploadSlugs).toEqual(['files']);
  });

  it('skip chat assets when chat persistence is disabled', async () => {
    const { payloadConfig, clientUploadSlugs } = await build({ plugins: [s3()] });

    expect(payloadConfig.collections.map(({ slug }) => slug)).not.toContain(chatAssetsSlug);
    expect(clientUploadSlugs).toEqual(['files']);
  });

  it('assign built-in collections to the first adapter', async () => {
    const { upload } = await build({
      collections: [Users, Files, Chats, Media],
      plugins: [s3(), gcs({ collections: { media: true } })],
    });

    expect(upload('files')).toMatchObject({ adapter: 's3' });
    expect(upload(chatAssetsSlug)).toMatchObject({ adapter: 's3' });
    expect(upload('media')).toMatchObject({ adapter: 'gcs' });
  });

  it('give a built-in collection to the adapter that lists it', async () => {
    const { upload } = await build({
      collections: [Users, Files, Chats],
      plugins: [s3(), gcs({ collections: { files: { prefix: 'files' } } })],
    });

    expect(upload('files')).toMatchObject({ adapter: 'gcs' });
    expect(upload(chatAssetsSlug)).toMatchObject({ adapter: 's3' });
  });

  it('cover only chat assets when nothing is marked file: true', async () => {
    const { payloadConfig, clientUploadSlugs } = await build({
      collections: [Users, Chats],
      plugins: [s3()],
    });

    expect(payloadConfig.collections.map(({ slug }) => slug)).not.toContain('files');
    expect(clientUploadSlugs).toEqual([chatAssetsSlug]);
  });

  it('build without built-in upload collections when chat is off and nothing is marked file: true', async () => {
    const { payloadConfig, clientUploadSlugs } = await build({
      collections: [Users],
      plugins: [s3()],
    });

    expect(payloadConfig.collections.map(({ slug }) => slug)).not.toContain('files');
    expect(payloadConfig.collections.map(({ slug }) => slug)).not.toContain(chatAssetsSlug);
    expect(clientUploadSlugs).toEqual([]);
  });

  it('add no files collection when an adapter lists files and nothing is marked file: true', async () => {
    const { payloadConfig } = await build({
      collections: [Users],
      plugins: [s3({ collections: { files: true } })],
    });

    expect(payloadConfig.collections.map(({ slug }) => slug)).not.toContain('files');
  });

  it('reject a collection listed in two adapters', async () => {
    await expect(
      build({
        collections: [Users, Media],
        plugins: [s3({ collections: { media: true } }), gcs({ collections: { media: true } })],
      }),
    ).rejects.toThrow(
      "[frogbot] Collection 'media' is listed in more than one storage adapter. List it in exactly one.",
    );
  });

  it('run every onInit callback after the adapter wraps it', async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { sanitized } = await build({ onInit: [first, second], plugins: [s3()] });

    await sanitized.onInit?.({} as FrogBot);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it.each([
    ['r2', r2Storage({ bucket: {} as Parameters<typeof r2Storage>[0]['bucket'] })],
    ['gcs', gcs()],
    [
      'azure',
      azureStorage({
        allowContainerCreate: false,
        baseURL: 'http://127.0.0.1:10000/devstoreaccount1',
        connectionString: 'UseDevelopmentStorage=true',
        containerName: 'container',
      }),
    ],
    ['uploadthing', uploadthingStorage({ options: { token: 'token' } })],
    ['vercel-blob', vercelBlobStorage({ token: 'vercel_blob_rw_store_secret' })],
  ])('%s covers the files collection', async (adapter, plugin) => {
    const { upload } = await build({ plugins: [plugin] });

    expect(upload('files')).toMatchObject({ adapter });
  });
});

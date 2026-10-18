import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { getPayloadConfig } from '../../../../packages/frogbot/src/exports/internal.js';

async function buildPayloadConfig(config: Partial<FrogBotConfig> = {}) {
  const built = await buildConfig({
    secret: 'test-secret',
    db: { defaultIDType: 'number', init: () => ({}) } as unknown as FrogBotConfig['db'],
    typescript: { autoGenerate: false },
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }],
    ...config,
  });

  const payloadConfig = await getPayloadConfig(built);

  return { built, payloadConfig };
}

describe('files collection opt-in', () => {
  it('has no files collection and no folders with a bare config', async () => {
    const { built, payloadConfig } = await buildPayloadConfig();
    const slugs = payloadConfig.collections.map(({ slug }) => slug);

    expect(built.files).toBeUndefined();
    expect(slugs).not.toContain('files');
    expect(slugs).not.toContain('folders');
  });

  it('adopts a marked collection with merged defaults and a folders collection', async () => {
    const { built, payloadConfig } = await buildPayloadConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'documents', file: true, upload: true, fields: [] },
      ],
    });

    const documents = payloadConfig.collections.find(({ slug }) => slug === 'documents');

    expect(built.files).toEqual({ slug: 'documents' });
    expect(documents?.fields.map((field) => ('name' in field ? field.name : undefined))).toContain(
      '_h_folders',
    );
    expect(documents?.upload).toBeTruthy();
    expect(documents?.trash).toBe(true);
    expect(documents?.admin?.useAsTitle).toBe('filename');
    expect(
      payloadConfig.collections.find(({ slug }) => slug === 'folders')?.hierarchy,
    ).toBeTruthy();
  });

  it("files into the app's own folders collection when it has one", async () => {
    const { payloadConfig } = await buildPayloadConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'drawers', folders: true, fields: [{ name: 'name', type: 'text' }] },
        { slug: 'documents', file: true, upload: true, fields: [] },
      ],
    });

    const slugs = payloadConfig.collections.map(({ slug }) => slug);
    const documents = payloadConfig.collections.find(({ slug }) => slug === 'documents');

    expect(slugs).not.toContain('folders');
    expect(documents?.fields.map((field) => ('name' in field ? field.name : undefined))).toContain(
      '_h_drawers',
    );
  });

  it('rejects an upload field related to a files collection that is not declared', async () => {
    await expect(
      buildPayloadConfig({
        collections: [
          { slug: 'users', auth: true, fields: [] },
          {
            slug: 'docs',
            fields: [{ name: 'doc', type: 'upload', relationTo: 'files' }],
          },
        ],
      } as never),
    ).rejects.toThrow("invalid relationship 'files'");
  });
});

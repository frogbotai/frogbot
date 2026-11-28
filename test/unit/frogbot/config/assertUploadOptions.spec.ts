import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import { assertUploadOptions } from '../../../../packages/frogbot/src/config/assertUploadOptions.js';
import { ConfigIssueError } from '../../../../packages/frogbot/src/config/issue.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';

function config(
  collections: CollectionConfig[],
  extra: Record<string, unknown> = {},
): FrogBotConfig {
  return { secret: 's', db: {} as FrogBotConfig['db'], collections, ...extra };
}

function upload(slug: string, options: Record<string, unknown>): CollectionConfig {
  return { slug, fields: [], upload: options };
}

function issue(value: FrogBotConfig): ConfigIssueError {
  try {
    assertUploadOptions(value);
  } catch (error) {
    if (error instanceof ConfigIssueError) return error;
    throw error;
  }

  throw new Error('assertUploadOptions did not throw');
}

describe('assertUploadOptions', () => {
  it('points upload.imageSizes at the sharp transformer with the FrogBot snippet and docs', () => {
    const error = issue(config([upload('pins', { imageSizes: [{ name: 'thumb', width: 200 }] })]));

    expect(error).toMatchObject({
      code: 'UPLOAD_OPTION_MISPLACED',
      path: 'collections.pins.upload.imageSizes',
    });
    expect(error.message).toBe(
      '[frogbot] Collection "pins" sets `upload.imageSizes`, which FrogBot reads only from the sharp transformer. ' +
        'Use `upload: { transformers: [sharpTransformer({ collections: { "pins": { variants: ... } } })] }`, ' +
        'with `sharpTransformer` from `@frogbotai/transformer-sharp`. See https://docs.frogbot.ai/upload/overview#image-sizes',
    );
  });

  it('names every misplaced option of every collection in one error', () => {
    const error = issue(
      config([
        upload('pins', { imageSizes: [], resizeOptions: {} }),
        upload('media', { variants: [], withMetadata: true }),
      ]),
    );

    expect(error.message).toContain(
      'sharpTransformer({ collections: { "pins": { variants: ..., resizeOptions: ... }, "media": { variants: ..., withMetadata: ... } } })',
    );
    expect(error.message).toContain(
      'Collection "media" sets `upload.variants`, `upload.withMetadata`',
    );
  });

  it('refuses a top-level sharp', () => {
    const error = issue(config([], { sharp: () => undefined }));

    expect(error.path).toBe('sharp');
    expect(error.message).toContain('Add `sharpTransformer()` from `@frogbotai/transformer-sharp`');
    expect(error.message).not.toMatch(/payload/i);
  });

  it('accepts upload collections that leave image options to the transformer', () => {
    expect(() =>
      assertUploadOptions(
        config([upload('media', { mimeTypes: ['image/*'] }), { slug: 'posts', fields: [] }]),
      ),
    ).not.toThrow();
  });
});

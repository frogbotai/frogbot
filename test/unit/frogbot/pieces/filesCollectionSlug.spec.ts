import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { filesCollectionSlug } from '../../../../packages/frogbot/src/pieces/files.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

describe('filesCollectionSlug', () => {
  it('returns the files collection slug', () => {
    const req = {
      frogbot: { config: { files: { slug: 'media' } } },
    } as unknown as FrogBotRequest;

    expect(filesCollectionSlug(req, 'QR Code')).toBe('media');
  });

  it('throws the shared message naming the piece when no files collection exists', () => {
    const req = { frogbot: { config: {} } } as unknown as FrogBotRequest;

    expect(() => filesCollectionSlug(req, 'QR Code')).toThrow(
      '[frogbot] QR Code requires a files collection. Add an upload collection with `file: true`.',
    );
  });

  it('throws the shared message when the request has no config', () => {
    const req = { frogbot: {} } as unknown as FrogBotRequest;

    expect(() => filesCollectionSlug(req, 'QR Code')).toThrow(
      '[frogbot] QR Code requires a files collection. Add an upload collection with `file: true`.',
    );
  });

  it('throws the shared message for an upload collection named files without file: true', async () => {
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number', init: () => ({}) } as unknown as FrogBotConfig['db'],
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'files', upload: true, fields: [] },
      ],
    });

    const req = { frogbot: { config } } as unknown as FrogBotRequest;

    expect(() => filesCollectionSlug(req, 'QR Code')).toThrow(
      '[frogbot] QR Code requires a files collection. Add an upload collection with `file: true`.',
    );
  });
});

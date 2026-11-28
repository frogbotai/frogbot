import { describe, expect, it, vi } from 'vitest';

import { sanitizeCollection } from '../../../../../packages/frogbot/src/collections/config/sanitize.js';
import type { CollectionConfig } from '../../../../../packages/frogbot/src/collections/config/types.js';

const sanitize = (auth: unknown) =>
  sanitizeCollection({ slug: 'users', auth, fields: [] } as CollectionConfig, vi.fn(), {
    resolveFrogBot: vi.fn(),
  });

describe('sanitizeCollection auth', () => {
  it.each([true, false])('rejects useAPIKey: %s and points to the API keys docs', (value) => {
    expect(() => sanitize({ useAPIKey: value })).toThrow(
      "[frogbot] Collection 'users' auth has no built-in API keys. Remove useAPIKey and see https://docs.frogbot.ai/authentication/api-keys.",
    );
  });

  it('never passes useAPIKey through to Payload', () => {
    const collection = sanitize({ tokenExpiration: 60 });

    expect(collection.auth).toEqual({ tokenExpiration: 60 });
  });
});

describe('sanitizeCollection upload', () => {
  const upload = (value: unknown) =>
    sanitizeCollection({ slug: 'pins', upload: value, fields: [] } as CollectionConfig, vi.fn(), {
      resolveFrogBot: vi.fn(),
    }).upload;

  it.each([true, {}, { staticDir: '' }])(
    'stores files in files/<slug>, which apps already ignore, for upload: %j',
    (value) => {
      expect(upload(value)).toMatchObject({ staticDir: 'files/pins' });
    },
  );

  it('keeps a staticDir the collection sets', () => {
    expect(upload({ staticDir: 'media', mimeTypes: ['image/*'] })).toEqual({
      staticDir: 'media',
      mimeTypes: ['image/*'],
    });
  });

  it('leaves collections without uploads alone', () => {
    expect(upload(undefined)).toBeUndefined();
    expect(upload(false)).toBe(false);
  });
});

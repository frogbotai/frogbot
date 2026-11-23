import { describe, expect, it } from 'vitest';

import { sanitizeVectorFields } from '../../../../packages/frogbot/src/fields/config/sanitizeVector.js';
import type { Field, UploadField } from '../../../../packages/frogbot/src/fields/config/types.js';

function upload(extra: Partial<UploadField> = {}): Field {
  return { name: 'photo', type: 'upload', relationTo: 'media', ...extra } as UploadField;
}

describe('upload preview', () => {
  it("adds the large preview class for preview: 'large' and drops the key", () => {
    const [field] = sanitizeVectorFields({
      collection: 'products',
      fields: [upload({ preview: 'large', admin: { className: 'mine' } })],
    });

    expect(field).not.toHaveProperty('preview');
    expect(field).toMatchObject({ admin: { className: 'mine fb-upload-preview--large' } });
  });

  it("leaves preview: 'small' as the default thumbnail", () => {
    const [field] = sanitizeVectorFields({
      collection: 'products',
      fields: [upload({ preview: 'small' })],
    });

    expect(field).not.toHaveProperty('preview');
    expect(field).not.toHaveProperty('admin.className');
  });

  it('reaches upload fields inside tabs and arrays', () => {
    const [tabs] = sanitizeVectorFields({
      collection: 'products',
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Media',
              fields: [{ name: 'gallery', type: 'array', fields: [upload({ preview: 'large' })] }],
            },
          ],
        },
      ],
    });

    expect(tabs).toMatchObject({
      tabs: [{ fields: [{ fields: [{ admin: { className: 'fb-upload-preview--large' } }] }] }],
    });
  });
});

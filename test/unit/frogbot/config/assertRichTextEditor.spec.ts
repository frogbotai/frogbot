import { describe, expect, it } from 'vitest';

import { assertRichTextEditor } from '../../../../packages/frogbot/src/fields/config/assertRichTextEditor.js';

describe('assertRichTextEditor', () => {
  it('reports the collection and nested field path when no editor is configured', () => {
    const config = {
      collections: [
        {
          slug: 'posts',
          fields: [
            {
              name: 'layout',
              type: 'tabs',
              tabs: [{ fields: [{ name: 'content', type: 'richText' }] }],
            },
          ],
        },
      ],
    };

    expect(() => assertRichTextEditor(config as never)).toThrow(
      "[frogbot] Rich text field 'layout.content' in collection 'posts' requires a Lexical editor",
    );
  });

  it('accepts a field-level editor in nested blocks', () => {
    const config = {
      collections: [
        {
          slug: 'posts',
          fields: [
            {
              name: 'sections',
              type: 'blocks',
              blocks: [
                { slug: 'copy', fields: [{ name: 'content', type: 'richText', editor: () => {} }] },
              ],
            },
          ],
        },
      ],
    };

    expect(() => assertRichTextEditor(config as never)).not.toThrow();
  });

  it('validates rich text nested in object block references', () => {
    const config = {
      collections: [
        {
          slug: 'posts',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blockReferences: [{ slug: 'copy', fields: [{ name: 'content', type: 'richText' }] }],
            },
          ],
        },
      ],
    };

    expect(() => assertRichTextEditor(config as never)).toThrow(
      "Rich text field 'layout.content' in collection 'posts'",
    );
  });

  it('validates dashboard widget fields and handles shared field cycles', () => {
    const richText = { name: 'content', type: 'richText' };
    const group = { fields: [richText], name: 'settings', type: 'group' };
    group.fields.push(group as never);
    const config = {
      admin: {
        dashboard: {
          widgets: [{ Component: './Widget#Widget', fields: [group], slug: 'welcome' }],
        },
      },
      collections: [{ slug: 'posts', fields: [] }],
    };

    expect(() => assertRichTextEditor(config as never)).toThrow(
      "in admin dashboard widget 'welcome'",
    );
  });
});

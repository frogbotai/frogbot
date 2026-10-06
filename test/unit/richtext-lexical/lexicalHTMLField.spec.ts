import { describe, expect, it } from 'vitest';

import { lexicalHTMLField } from '../../../packages/richtext-lexical/src/features/converters/lexicalToHtml/async/field/index.js';

function codeField(field: ReturnType<typeof lexicalHTMLField>) {
  if (field.type !== 'code') throw new Error(`Expected a code field, got ${field.type}`);

  return field;
}

describe('lexicalHTMLField', () => {
  it('loads the async converter subpath and generates FrogBot HTML', async () => {
    const field = codeField(
      lexicalHTMLField({
        htmlFieldName: 'html',
        lexicalFieldName: 'content',
      }),
    );
    const afterRead = field.hooks?.afterRead?.[0];

    expect(afterRead).toBeTypeOf('function');

    const html = await afterRead!({
      blockData: undefined,
      collection: null,
      context: {},
      currentDepth: 0,
      depth: 1,
      field,
      global: null,
      indexPath: [],
      path: ['html'],
      req: {} as never,
      schemaPath: ['html'],
      siblingFields: [],
      siblingData: {
        content: {
          root: {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'FrogBot',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        },
      },
    });

    expect(html).toBe('<div class="frogbot-richtext"><p>FrogBot</p></div>');
  });
});

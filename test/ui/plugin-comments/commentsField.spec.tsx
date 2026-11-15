import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  CommentsField,
  type CommentsFieldProps,
} from '../../../packages/plugins/plugin-comments/src/rsc/CommentsField.js';
import { soleInTab } from '../../../packages/plugins/plugin-comments/src/rsc/heading.js';

const req = { payload: {}, user: { id: 1 } } as unknown as NonNullable<CommentsFieldProps['req']>;

const tabs = new Map<string, unknown>([
  [
    'deals._index-1-0',
    { type: 'tab', label: 'Comments', fields: [{ name: 'comments', type: 'ui' }] },
  ],
  [
    'deals._index-1-1',
    {
      type: 'tab',
      label: 'Discussion',
      fields: [
        { name: 'comments', type: 'ui' },
        { name: 'summary', type: 'text' },
      ],
    },
  ],
  [
    'deals._index-1-2',
    {
      type: 'tab',
      label: 'Notes',
      fields: [
        { name: 'comments', type: 'ui' },
        { name: 'hiddenThing', type: 'text', admin: { hidden: true } },
      ],
    },
  ],
]);

function heading(props: Partial<CommentsFieldProps>) {
  const node = CommentsField({ collectionSlug: 'deals', id: 1, req, ...props });

  if (!isValidElement(node)) throw new Error('Expected an element.');

  return (node as ReactElement<{ heading?: unknown }>).props.heading;
}

describe('CommentsField', () => {
  it('shows its label as a heading when placed on its own in fields', () => {
    expect(heading({ schemaPath: 'deals.comments', fieldSchemaMap: tabs })).toBe('Comments');
    expect(heading({ field: { label: 'Discussion' }, schemaPath: 'deals.comments' })).toBe(
      'Discussion',
    );
  });

  it("leaves the heading to the tab when it is the tab's only visible field", () => {
    expect(
      heading({ schemaPath: 'deals._index-1-0.comments', fieldSchemaMap: tabs }),
    ).toBeUndefined();
    expect(
      heading({ schemaPath: 'deals._index-1-2.comments', fieldSchemaMap: tabs }),
    ).toBeUndefined();
  });

  it('keeps its heading in a tab shared with other fields', () => {
    expect(heading({ schemaPath: 'deals._index-1-1.comments', fieldSchemaMap: tabs })).toBe(
      'Comments',
    );
  });

  it('hides the heading with label: false and renders nothing on a create form', () => {
    expect(heading({ field: { label: false }, schemaPath: 'deals.comments' })).toBeUndefined();
    expect(CommentsField({ collectionSlug: 'deals', req })).toBeNull();
  });

  it('reads placement only from a tab', () => {
    const groups = new Map<string, unknown>([
      ['deals.meta', { type: 'group', fields: [{ name: 'comments' }] }],
    ]);

    expect(soleInTab({ fieldSchemaMap: groups, schemaPath: 'deals.meta.comments' })).toBe(false);
    expect(soleInTab({ schemaPath: 'deals.comments' })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { isGroupByEnabled } from '../../../../packages/next/src/views/controls/groupBy.js';

describe('isGroupByEnabled', () => {
  it('honors a list override before the collection runtime setting', () => {
    expect(isGroupByEnabled({ collectionGroupBy: true, enableGroupBy: false })).toBe(false);
    expect(isGroupByEnabled({ collectionGroupBy: false, enableGroupBy: true })).toBe(true);
  });

  it('uses the collection runtime setting without an override', () => {
    expect(isGroupByEnabled({ collectionGroupBy: true, enableGroupBy: undefined })).toBe(true);
    expect(isGroupByEnabled({ collectionGroupBy: undefined, enableGroupBy: undefined })).toBe(
      false,
    );
  });
});

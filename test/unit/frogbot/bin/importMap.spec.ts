import { describe, expect, it, vi } from 'vitest';

import { iterateCollections } from '../../../../packages/frogbot/src/bin/generateImportMap/iterateCollections.js';

describe('collection import map', () => {
  it('collects the injected collection view switcher slot', () => {
    const addToImportMap = vi.fn();

    iterateCollections({
      addToImportMap,
      baseDir: '/tmp',
      collections: [
        {
          admin: {
            components: { beforeListTable: ['@frogbotai/next/client#ViewSwitcher'] },
          },
          fields: [],
          slug: 'posts',
        },
      ] as never,
      config: {} as never,
      importMap: {},
      imports: {},
    });

    expect(addToImportMap).toHaveBeenCalledWith(['@frogbotai/next/client#ViewSwitcher']);
  });
});

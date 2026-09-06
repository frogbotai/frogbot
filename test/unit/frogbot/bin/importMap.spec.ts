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

  it('collects a collection board Card override', () => {
    const addToImportMap = vi.fn();
    iterateCollections({
      addToImportMap,
      baseDir: '/tmp',
      collections: [
        {
          admin: {},
          custom: {
            frogbot: {
              collectionViews: [
                { components: { Card: './Card#Card' }, slug: 'board', type: 'board' },
              ],
            },
          },
          fields: [],
          slug: 'posts',
        },
      ] as never,
      config: {} as never,
      importMap: {},
      imports: {},
    });
    expect(addToImportMap).toHaveBeenCalledWith('./Card#Card');
  });

  it('collects collection calendar slots and Event override', () => {
    const addToImportMap = vi.fn();
    iterateCollections({
      addToImportMap,
      baseDir: '/tmp',
      collections: [
        {
          admin: {},
          custom: {
            frogbot: {
              collectionViews: [
                {
                  components: {
                    beforeCalendar: ['./Before#Before'],
                    afterCalendar: ['./After#After'],
                    Event: './Event#Event',
                  },
                  slug: 'calendar',
                  start: 'startsAt',
                  type: 'calendar',
                },
              ],
            },
          },
          fields: [],
          slug: 'events',
        },
      ] as never,
      config: {} as never,
      importMap: {},
      imports: {},
    });

    expect(addToImportMap).toHaveBeenCalledWith(['./Before#Before']);
    expect(addToImportMap).toHaveBeenCalledWith(['./After#After']);
    expect(addToImportMap).toHaveBeenCalledWith('./Event#Event');
  });
});

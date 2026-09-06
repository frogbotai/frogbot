import { describe, expect, it, vi } from 'vitest';

import {
  getActiveViewSlug,
  resolveCollectionViews,
} from '../../../../packages/next/src/views/collectionViews.js';

describe('collection view resolution', () => {
  it('evaluates access on the server and removes denied metadata', async () => {
    const allowed = vi.fn(() => true);
    const denied = vi.fn(() => false);
    const req = { user: { id: '1' } };
    const result = await resolveCollectionViews({
      collectionConfig: {
        admin: {
          custom: {
            frogbot: {
              views: [
                { label: 'Open', path: '', slug: 'open', type: 'board' },
                { label: 'Secret', path: '/secret', slug: 'secret', type: 'board' },
              ],
            },
          },
        },
        custom: {
          frogbot: {
            collectionViews: [
              { access: allowed, slug: 'open', type: 'board' },
              { access: denied, slug: 'secret', type: 'board' },
            ],
          },
        },
      },
      initPageResult: { req },
    } as never);

    expect(result.views.map(({ slug }) => slug)).toEqual(['open']);
    expect(allowed).toHaveBeenCalledWith({ req });
    expect(denied).toHaveBeenCalledWith({ req });
  });

  it('resolves root and named routes independently', () => {
    expect(getActiveViewSlug({ viewType: 'list' } as never)).toBeUndefined();
    expect(getActiveViewSlug({ viewType: 'by-stage' } as never)).toBe('by-stage');
    const collectionConfig = { custom: { frogbot: { collectionViews: [{ slug: 'board' }] } } };
    expect(
      getActiveViewSlug({
        collectionConfig,
        params: { segments: ['collections', 'pipelines', 'board'] },
      } as never),
    ).toBe('board');
    expect(
      getActiveViewSlug({
        collectionConfig,
        params: { segments: ['collections', 'pipelines'] },
      } as never),
    ).toBeUndefined();
  });
});

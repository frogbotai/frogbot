import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

const { ViewRedirect } =
  await import('../../../../packages/next/src/elements/ViewRedirect/index.js');

function props(value: unknown) {
  return {
    collectionConfig: {
      admin: {
        custom: {
          frogbot: {
            views: [
              { key: 'list', path: '' },
              { key: 'stub', path: '/stub' },
            ],
          },
        },
      },
    },
    collectionSlug: 'posts',
    payload: {
      config: { routes: { admin: '/admin' } },
      find: vi.fn(() => Promise.resolve({ docs: [{ value }] })),
    },
    req: { url: 'https://example.test/admin/collections/posts?where=active' },
  };
}

describe('ViewRedirect', () => {
  it('opens the saved alternate view and preserves the query', async () => {
    const input = props({ view: 'stub' });

    await ViewRedirect(input);

    expect(input.payload.find).toHaveBeenCalledWith({
      collection: 'payload-preferences',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      req: input.req,
      where: { key: { equals: 'frogbot-view-posts' } },
    });
    expect(redirect).toHaveBeenCalledWith('/admin/collections/posts/stub?where=active');
  });

  it.each([{ view: 'list' }, { view: 'missing' }, undefined])(
    'does not redirect for %j',
    async (value) => {
      redirect.mockClear();

      await ViewRedirect(props(value));

      expect(redirect).not.toHaveBeenCalled();
    },
  );
});

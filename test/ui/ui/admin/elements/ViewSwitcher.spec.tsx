import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setPreference = vi.fn(() => Promise.resolve());

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { admin: '/admin' } } }),
  usePreferences: () => ({ setPreference }),
}));

const { RouterAdapterProvider } =
  await import('../../../../../packages/ui/src/admin/adapters/router.js');

const { ViewSwitcher } =
  await import('../../../../../packages/ui/src/admin/elements/ViewSwitcher/index.client.js');

const views = [
  { label: 'List', path: '', slug: 'list', type: 'list' },
  { label: 'Board', path: '/board', slug: 'board', type: 'board' },
];

describe('ViewSwitcher under a router adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates through the adapter it is given', async () => {
    const router = { back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };

    render(
      <RouterAdapterProvider
        value={{
          pathname: '/admin/collections/posts',
          router,
          searchParams: new URLSearchParams('page=2'),
        }}
      >
        <ViewSwitcher collectionSlug="posts" views={views} />
      </RouterAdapterProvider>,
    );

    expect(screen.getByRole('link', { name: 'List' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('link', { name: 'Board' }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/admin/collections/posts/board?page=2'),
    );

    expect(setPreference).toHaveBeenCalledWith('frogbot:collection-view:posts', { view: 'board' });
  });

  it('names the missing provider when rendered without an adapter', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ViewSwitcher collectionSlug="posts" views={views} />)).toThrow(
      '[frogbot] useRouterAdapter needs a RouterAdapterProvider.',
    );
  });
});

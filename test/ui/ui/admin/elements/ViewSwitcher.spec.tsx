import type * as PayloadUI from '@payloadcms/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setPreference = vi.fn(() => Promise.resolve());

vi.mock('@payloadcms/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadUI>()),
  useConfig: () => ({ config: { routes: { admin: '/admin' } } }),
  usePreferences: () => ({ setPreference }),
}));

const { RouterAdapterContext } = await import('@payloadcms/ui');

const { ViewSwitcher } =
  await import('../../../../../packages/ui/src/admin/elements/ViewSwitcher/index.client.js');

const views = [
  { label: 'List', path: '', slug: 'list', type: 'list' },
  { label: 'Board', path: '/board', slug: 'board', type: 'board' },
];

describe("ViewSwitcher under Payload's router adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates through the adapter it is given', async () => {
    const router = { back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };

    render(
      <RouterAdapterContext
        value={{
          Link: ({ children, href }) => <a href={href}>{children}</a>,
          params: {},
          pathname: '/admin/collections/posts',
          router,
          searchParams: new URLSearchParams('page=2'),
        }}
      >
        <ViewSwitcher collectionSlug="posts" views={views} />
      </RouterAdapterContext>,
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
      'useRouter/usePathname/useSearchParams/useParams must be used within a RouterAdapterProvider',
    );
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/admin/collections/posts/stub',
  searchParams: new URLSearchParams('where%5Bstatus%5D%5Bequals%5D=draft'),
  views: [] as Array<{ key: string; label: string; path: string }>,
  setPreference: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({
    config: { routes: { admin: '/admin' } },
    getEntityConfig: () => ({ admin: { custom: { frogbot: { views: mocks.views } } } }),
  }),
  usePreferences: () => ({ setPreference: mocks.setPreference }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

const { ViewSwitcher } =
  await import('../../../../packages/next/src/elements/ViewSwitcher/index.client.js');

describe('ViewSwitcher', () => {
  it('renders nothing for one view', () => {
    mocks.views = [{ key: 'list', label: 'List', path: '' }];

    expect(renderToStaticMarkup(createElement(ViewSwitcher, { collectionSlug: 'posts' }))).toBe('');
  });

  it('links every view while preserving the current query', () => {
    mocks.views = [
      { key: 'list', label: 'List', path: '' },
      { key: 'stub', label: 'Stub', path: '/stub' },
    ];

    const html = renderToStaticMarkup(createElement(ViewSwitcher, { collectionSlug: 'posts' }));

    expect(html).toContain('href="/admin/collections/posts?where%5Bstatus%5D%5Bequals%5D=draft"');
    expect(html).toContain(
      'href="/admin/collections/posts/stub?where%5Bstatus%5D%5Bequals%5D=draft"',
    );
    expect(html).toContain('aria-current="page"');
  });

  it('persists the selected view', async () => {
    mocks.views = [
      { key: 'list', label: 'List', path: '' },
      { key: 'stub', label: 'Stub', path: '/stub' },
    ];
    const element = ViewSwitcher({ collectionSlug: 'posts' });
    const links = element?.props.children as Array<{
      props: { onClick: (event: { preventDefault: () => void }) => Promise<void> };
    }>;
    const preventDefault = vi.fn();

    await links[0].props.onClick({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.setPreference).toHaveBeenCalledWith('frogbot-view-posts', { view: 'list' });
    expect(mocks.push).toHaveBeenCalledWith(
      '/admin/collections/posts?where%5Bstatus%5D%5Bequals%5D=draft',
    );
  });
});

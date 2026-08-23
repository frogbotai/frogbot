import { render, screen } from '@testing-library/react';
import type { ServerProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { CollectionsSection } from './CollectionsSection';

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: () => <svg data-testid="custom-icon" />,
}));

vi.mock('./NavSection', () => ({
  NavSection: ({ children, title }: React.PropsWithChildren<{ title: string }>) => (
    <section aria-label={title}>{children}</section>
  ),
}));

vi.mock('./NavItem', () => ({
  NavItem: ({ icon, label, path }: { icon: React.ReactNode; label: string; path: string }) => (
    <a data-icon={icon ? 'present' : 'missing'} href={path}>
      {label}
    </a>
  ),
}));

const i18n = {
  t: (key: string) =>
    ({ 'general:collections': 'Collections', 'general:globals': 'Globals' })[key] ?? key,
} as ServerProps['i18n'];

function props(): ServerProps {
  return {
    i18n,
    payload: {
      config: {
        collections: [
          { admin: { group: 'Content', icon: 'CustomIcon' }, labels: { plural: 'Posts' }, slug: 'posts' },
          { admin: { group: 'Content' }, labels: { plural: 'Drafts' }, slug: 'drafts' },
          { admin: { group: false }, labels: { plural: 'Hidden' }, slug: 'hidden' },
          { admin: { group: 'Content' }, labels: { plural: 'Secret' }, slug: 'secret' },
        ],
        globals: [],
        routes: { admin: '/admin' },
      },
      importMap: {},
    },
    permissions: {
      collections: {
        drafts: { read: false },
        hidden: { read: true },
        posts: { read: true },
        secret: { read: true },
      },
      globals: {},
    },
    visibleEntities: { collections: ['posts', 'drafts', 'hidden'], globals: [] },
  } as unknown as ServerProps;
}

describe('CollectionsSection', () => {
  it('renders grouped, visible entities with read access and configured icons', () => {
    render(<CollectionsSection {...props()} />);

    expect(screen.getByRole('region', { name: 'Collections' })).not.toBeNull();
    expect(screen.getByText('Content')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('href')).toBe(
      '/admin/collections/posts',
    );
    expect(screen.getByRole('link', { name: 'Posts' }).dataset.icon).toBe('present');
    expect(screen.queryByText('Drafts')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText('Secret')).toBeNull();
  });

  it('renders nothing without the collection model inputs', () => {
    const { container } = render(<CollectionsSection {...props()} visibleEntities={undefined} />);

    expect(container.innerHTML).toBe('');
  });
});

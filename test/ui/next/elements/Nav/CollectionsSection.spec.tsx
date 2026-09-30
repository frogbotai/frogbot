import { BubbleChatIcon, FolderIcon, KeyRoundIcon } from '@frogbotai/ui/icons';
import { render, screen } from '@testing-library/react';
import type { ServerProps } from 'payload';
import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionsSection } from '../../../../../packages/next/src/elements/Nav/CollectionsSection';

const renderServerComponent = vi.hoisted(() =>
  vi.fn((_args: { Component: unknown }) => <svg data-testid="custom-icon" />),
);

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: renderServerComponent,
}));

vi.mock('../../../../../packages/next/src/elements/Nav/NavSection', () => ({
  NavSection: ({ children, title }: React.PropsWithChildren<{ title: string }>) => (
    <section aria-label={title}>{children}</section>
  ),
}));

vi.mock('../../../../../packages/next/src/elements/Nav/NavItem', () => ({
  NavItem: ({ icon, label, path }: { icon: ReactNode; label: string; path: string }) => (
    <a data-element={isValidElement(icon) ? 'element' : 'other'} href={path}>
      <span data-testid={`icon-${label}`}>{icon}</span>
      {label}
    </a>
  ),
}));

const i18n = {
  t: (key: string) =>
    ({ 'general:collections': 'Collections', 'general:globals': 'Globals' })[key] ?? key,
} as ServerProps['i18n'];

const iconMarkup = (Icon: typeof FolderIcon) =>
  renderToStaticMarkup(<Icon className="frogbot-nav-item__icon-svg" size={20} />);

function props(): ServerProps {
  return {
    i18n,
    payload: {
      config: {
        collections: [
          {
            admin: { group: 'Content', icon: './CustomIcon#CustomIcon' },
            labels: { plural: 'Posts' },
            slug: 'posts',
          },
          {
            admin: { group: 'Content', icon: 'bubble-chat' },
            labels: { plural: 'Chats' },
            slug: 'chats',
          },
          { admin: { group: 'Content' }, labels: { plural: 'Pages' }, slug: 'pages' },
          { admin: { group: 'Content' }, labels: { plural: 'Drafts' }, slug: 'drafts' },
          { admin: { group: false }, labels: { plural: 'Hidden' }, slug: 'hidden' },
          { admin: {}, labels: { plural: 'Files' }, slug: 'files' },
          { admin: { icon: 'key-round' }, labels: { plural: 'API Keys' }, slug: 'api-keys' },
          { admin: { group: 'Content' }, labels: { plural: 'Secret' }, slug: 'secret' },
        ],
        globals: [],
        routes: { admin: '/admin' },
      },
      importMap: {},
    },
    permissions: {
      collections: {
        'api-keys': { read: true },
        chats: { read: true },
        drafts: { read: false },
        files: { read: true },
        hidden: { read: true },
        pages: { read: true },
        posts: { read: true },
        secret: { read: true },
      },
      globals: {},
    },
    visibleEntities: {
      collections: ['posts', 'chats', 'pages', 'drafts', 'hidden', 'files', 'api-keys'],
      globals: [],
    },
  } as unknown as ServerProps;
}

describe('CollectionsSection', () => {
  beforeEach(() => {
    renderServerComponent.mockClear();
  });

  it('renders grouped, visible entities with read access', () => {
    render(<CollectionsSection {...props()} />);

    expect(screen.getByRole('region', { name: 'Collections' })).not.toBeNull();
    expect(screen.getByText('Content')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('href')).toBe(
      '/admin/collections/posts',
    );
    expect(screen.queryByText('Drafts')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText('Secret')).toBeNull();
  });

  it('lists ungrouped entities directly under the section without a group label', () => {
    const { container } = render(<CollectionsSection {...props()} />);

    const labels = [...container.querySelectorAll('.frogbot-collections-section__group-label')];
    const files = screen.getByRole('link', { name: 'Files' });

    expect(labels.map((label) => label.textContent)).toEqual(['Content']);
    expect(files.closest('.frogbot-collections-section__group')).toBeNull();
    expect(
      files.compareDocumentPosition(labels[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders a built-in icon name from the icon registry', () => {
    render(<CollectionsSection {...props()} />);

    expect(screen.getByRole('link', { name: 'Chats' }).dataset.element).toBe('element');
    expect(screen.getByTestId('icon-Chats').innerHTML).toBe(iconMarkup(BubbleChatIcon));
    expect(renderServerComponent).not.toHaveBeenCalledWith(
      expect.objectContaining({ Component: 'bubble-chat' }),
    );
  });

  it('renders the key-round icon for a collection configured with it', () => {
    render(<CollectionsSection {...props()} />);

    expect(screen.getByTestId('icon-API Keys').innerHTML).toBe(iconMarkup(KeyRoundIcon));
  });

  it('renders a component path icon through the server component renderer', () => {
    render(<CollectionsSection {...props()} />);

    expect(renderServerComponent).toHaveBeenCalledTimes(1);
    expect(renderServerComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientProps: { className: 'frogbot-nav-item__icon-svg', size: 20 },
        Component: './CustomIcon#CustomIcon',
      }),
    );
    expect(screen.getByRole('link', { name: 'Posts' }).dataset.element).toBe('element');
    expect(screen.getByTestId('icon-Posts').querySelector('[data-testid="custom-icon"]')).not.toBe(
      null,
    );
  });

  it('renders a folder icon element when no icon is configured', () => {
    render(<CollectionsSection {...props()} />);

    expect(screen.getByRole('link', { name: 'Pages' }).dataset.element).toBe('element');
    expect(screen.getByTestId('icon-Pages').innerHTML).toBe(iconMarkup(FolderIcon));
  });

  it('renders nothing without the collection model inputs', () => {
    const { container } = render(<CollectionsSection {...props()} visibleEntities={undefined} />);

    expect(container.innerHTML).toBe('');
  });
});

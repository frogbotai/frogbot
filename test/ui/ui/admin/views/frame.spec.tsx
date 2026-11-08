import { render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  RenderServerComponent: vi.fn(),
  renderNavIcon: vi.fn(({ icon }: { icon?: unknown }) => `icon:${String(icon)}`),
}));

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  NoListResults: ({
    Actions,
    description,
    title,
  }: {
    Actions?: ReactNode[];
    description: string;
    title?: string;
  }) => (
    <div data-testid="no-results">
      {title ? <h2>{title}</h2> : null}
      <p>{description}</p>
      {Actions}
    </div>
  ),
  ViewDescription: ({ description }: { description: string }) => <p>{description}</p>,
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));

vi.mock('../../../../../packages/ui/src/admin/elements/Nav/renderNavIcon.js', () => ({
  renderNavIcon: mocks.renderNavIcon,
}));

vi.mock('../../../../../packages/ui/src/admin/views/ResetViewMenuItem.client.js', () => ({
  ResetViewMenuItem: ({ viewSlug }: { viewSlug: string }) => <button>Reset {viewSlug}</button>,
}));

const { buildFrameSlots } = await import('../../../../../packages/ui/src/admin/views/frame.js');

type Args = Parameters<typeof buildFrameSlots>[0];

const views = [
  { label: 'List', path: '', slug: 'list', type: 'list' },
  { label: 'Pipeline', path: '/board', slug: 'board', type: 'board' },
  { label: 'Due', path: '/calendar', slug: 'calendar', type: 'calendar' },
];

function args({
  CreateButton,
  NoResults,
  toolbar,
  trash,
  ...overrides
}: Partial<Args> & {
  CreateButton?: string;
  NoResults?: string;
  toolbar?: string[];
  trash?: boolean;
} = {}): Args {
  const runtime = [
    { type: 'list' as const, slug: 'list', components: { NoResults, toolbar } },
    { type: 'board' as const, slug: 'board', groupBy: 'stage', icon: 'tile' },
    { type: 'calendar' as const, slug: 'calendar', start: 'due' },
  ];

  return {
    activeSlug: 'list',
    adminRoute: '/admin',
    collectionConfig: {
      admin: { components: CreateButton ? { CreateButton } : {} },
      labels: { plural: 'Deals', singular: 'Deal' },
      slug: 'deals',
      trash: Boolean(trash),
    } as never,
    hasCreatePermission: true,
    hasDeletePermission: false,
    i18n: {
      t: (key: string, vars?: object) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    } as never,
    importMap: {},
    runtime,
    serverProps: {},
    view: runtime[0],
    views,
    ...overrides,
  };
}

const show = (nodes: ReactNode) => within(render(<div>{nodes}</div>).container);

describe('buildFrameSlots', () => {
  beforeEach(() => {
    mocks.RenderServerComponent.mockReset();

    mocks.RenderServerComponent.mockImplementation(
      ({ Component, clientProps }: { Component: string | string[]; clientProps: object }) => {
        const one = (path: string, key?: number) => (
          <button data-props={JSON.stringify(clientProps)} key={key} type="button">
            {path}
          </button>
        );

        return Array.isArray(Component) ? Component.map(one) : one(Component);
      },
    );
  });

  it('gives every view a tab with its icon, the type icon by default, and marks the active one', () => {
    const { tabs } = buildFrameSlots(args({ activeSlug: 'board' }));

    expect(tabs).toEqual([
      expect.objectContaining({ active: false, href: '/admin/collections/deals', label: 'List' }),
      expect.objectContaining({ active: true, href: '/admin/collections/deals/board' }),
      expect.objectContaining({ active: false, href: '/admin/collections/deals/calendar' }),
    ]);
    expect(tabs.map(({ icon }) => icon)).toEqual(['icon:list', 'icon:tile', 'icon:calendar']);
    expect(tabs.every(({ remember }) => remember)).toBe(true);
  });

  it('adds Trash after the views, active on the trash page, and not remembered', () => {
    const { tabs } = buildFrameSlots(args({ trash: true, view: undefined, viewType: 'trash' }));
    const trash = tabs.at(-1);

    expect(trash).toMatchObject({
      active: true,
      href: '/admin/collections/deals/trash',
      icon: 'icon:delete',
      label: 'general:trash',
    });
    expect(trash?.remember).toBeUndefined();
    expect(tabs.filter(({ active }) => active)).toHaveLength(1);
  });

  it('puts the toolbar and then the CreateButton in the toolbar, with the slot props', () => {
    const { hasCreateButton, Toolbar } = buildFrameSlots(
      args({ CreateButton: './Create', toolbar: ['./One', './Two'] }),
    );

    const toolbar = show(Toolbar);

    expect(hasCreateButton).toBe(true);
    expect(toolbar.getAllByRole('button').map((node) => node.textContent)).toEqual([
      './One',
      './Two',
      './Create',
    ]);
    expect(toolbar.getByText('./Create').parentElement?.className).toBe('fb-create-button');
    expect(JSON.parse(toolbar.getByText('./One').dataset.props!)).toEqual({
      collectionSlug: 'deals',
      hasCreatePermission: true,
      hasDeletePermission: false,
      newDocumentURL: '/admin/collections/deals/create',
    });
  });

  it("uses Payload's empty state with the CreateButton, so it shows once there and once in the toolbar", () => {
    const { NoResults, Toolbar } = buildFrameSlots(args({ CreateButton: './Create' }));
    const empty = show(NoResults);

    expect(show(Toolbar).getAllByRole('button', { name: './Create' })).toHaveLength(1);
    expect(empty.getAllByRole('button', { name: './Create' })).toHaveLength(1);
    expect(empty.getByRole('heading').textContent).toBe('general:noResultsFound');
  });

  it('links the empty state to the create page without a CreateButton', () => {
    const { NoResults, Toolbar } = buildFrameSlots(args());

    expect(Toolbar).toBeUndefined();
    expect(show(NoResults).getByRole('link').getAttribute('href')).toBe(
      '/admin/collections/deals/create',
    );
  });

  it("renders the view's own NoResults instead", () => {
    const { NoResults } = buildFrameSlots(args({ CreateButton: './Create', NoResults: './Empty' }));

    expect(show(NoResults).getByRole('button').textContent).toBe('./Empty');
    expect(mocks.RenderServerComponent).toHaveBeenCalledWith(
      expect.objectContaining({ Component: './Empty' }),
    );
  });

  it('keeps the CreateButton and the reset item out of the trash page', () => {
    const { listMenuItems, NoResults, Toolbar } = buildFrameSlots(
      args({ CreateButton: './Create', toolbar: ['./One'], viewType: 'trash' }),
    );

    expect(show(Toolbar).getByRole('button').textContent).toBe('./One');
    expect(show(NoResults).queryByRole('button')).toBeNull();
    expect(listMenuItems).toEqual([]);
  });

  it('ends the view menu with Reset to default', () => {
    const { listMenuItems } = buildFrameSlots(args({ view: args().runtime[1] }));

    expect(show(listMenuItems).getByRole('button').textContent).toBe('Reset board');
  });

  it('gives a custom view, which saves no setup, no reset item', () => {
    const view = { component: './Map#Map', slug: 'map', type: 'custom' as const };
    const { listMenuItems } = buildFrameSlots(args({ view }));

    expect(listMenuItems).toEqual([]);
  });
});

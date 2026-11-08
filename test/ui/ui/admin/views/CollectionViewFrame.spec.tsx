import { fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const plural: Record<string, string> = { tasks: 'Tasks', notes: 'Notes' };

  return {
    pathname: '/admin/collections/tasks/board',
    plural,
    push: vi.fn(),
    setPreference: vi.fn(() => Promise.resolve()),
    setStepNav: vi.fn(),
    smallBreak: false,
    ViewControls: vi.fn(
      (_props: { beforeActions?: ReactNode[]; hasCreatePermission?: boolean }) => (
        <div data-testid="view-controls" />
      ),
    ),
  };
});

vi.mock('@payloadcms/ui', () => ({
  ChevronIcon: () => null,
  Popup: ({ button, children }: { button: ReactNode; children: ReactNode }) => (
    <div>
      <button type="button">{button}</button>
      {children}
    </div>
  ),
  PopupList: {
    Button: ({
      ariaCurrent,
      children,
      onClick,
    }: {
      ariaCurrent?: 'page';
      children: ReactNode;
      onClick: () => void;
    }) => (
      <button aria-current={ariaCurrent} onClick={onClick} role="menuitem" type="button">
        {children}
      </button>
    ),
    ButtonGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
  useConfig: () => ({
    getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) => ({
      labels: { plural: mocks.plural[collectionSlug], singular: collectionSlug },
      slug: collectionSlug,
    }),
  }),
  usePathname: () => mocks.pathname,
  usePreferences: () => ({ setPreference: mocks.setPreference }),
  useRouter: () => ({ push: mocks.push }),
  useStepNav: () => ({ setStepNav: mocks.setStepNav }),
  useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
  useWindowInfo: () => ({ breakpoints: { s: mocks.smallBreak } }),
}));

vi.mock('../../../../../packages/ui/src/admin/views/controls/ViewControls.client.js', () => ({
  ViewControls: mocks.ViewControls,
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/RecordPanel.client.js', () => ({
  RecordPanel: () => <aside data-testid="record-panel" />,
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/RecordPanelProvider.client.js', () => ({
  RecordPanelProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRecordPanel: () => ({ enabled: true, openId: undefined, state: { mode: 'closed' } }),
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/useRecordLinks.js', () => ({
  useRecordLinks: () => undefined,
}));

const { CollectionViewFrame } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewFrame.client');

const tabs = [
  { active: false, href: '/admin/collections/tasks', label: 'List', remember: true, slug: 'list' },
  {
    active: true,
    href: '/admin/collections/tasks/board',
    icon: <svg data-testid="board-icon" />,
    label: 'Board',
    remember: true,
    slug: 'board',
  },
  { active: false, href: '/admin/collections/tasks/trash', label: 'Trash', slug: 'trash' },
];

function frame({
  collectionSlug = 'tasks',
  ...props
}: Partial<Parameters<typeof CollectionViewFrame>[0]> = {}) {
  return (
    <CollectionViewFrame
      collectionSlug={collectionSlug}
      enableColumns
      hasCreateButton={false}
      hasCreatePermission
      hasDeletePermission
      isEmpty={false}
      newDocumentURL={`/admin/collections/${collectionSlug}/create`}
      NoResults={<p>Nothing here</p>}
      tabs={tabs}
      type="board"
      {...props}
    >
      <div data-testid="view">body</div>
    </CollectionViewFrame>
  );
}

describe('CollectionViewFrame', () => {
  beforeEach(() => {
    mocks.pathname = '/admin/collections/tasks/board';
    mocks.push.mockClear();
    mocks.setPreference.mockClear();
    mocks.setStepNav.mockClear();
    mocks.smallBreak = false;
    mocks.ViewControls.mockClear();
  });

  it("renders Payload's list header, with the view tabs under the title", () => {
    const { container, getByRole } = render(frame({ Description: <p>About tasks</p> }));
    const header = container.querySelector('main.collection-list.collection-view--board > header');

    expect(header?.className).toBe('list-header');
    expect(header?.querySelector('h1.list-header__title')?.textContent).toBe('Tasks');
    expect(
      header?.querySelector('.list-header__after-header-content .collection-list__sub-header')
        ?.textContent,
    ).toBe('About tasks');

    const nav = getByRole('navigation', { name: 'Collection views' });

    expect(header?.contains(nav)).toBe(true);
    expect(getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBe('page');
    expect(getByRole('link', { name: 'List' }).getAttribute('aria-current')).toBeNull();
    expect(getByRole('link', { name: 'Trash' }).getAttribute('href')).toBe(
      '/admin/collections/tasks/trash',
    );
  });

  it('renders no tab row for a single view', () => {
    const { container, queryByRole } = render(frame({ tabs: [tabs[1]] }));

    expect(queryByRole('navigation')).toBeNull();
    expect(container.querySelector('.list-header__after-header-content')).toBeNull();
  });

  it('remembers a view tab before opening it, but not Trash', async () => {
    const { getByRole } = render(frame());

    fireEvent.click(getByRole('link', { name: 'List' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/admin/collections/tasks'));

    expect(mocks.setPreference).toHaveBeenCalledWith('frogbot:collection-view:tasks', {
      view: 'list',
    });

    mocks.setPreference.mockClear();
    fireEvent.click(getByRole('link', { name: 'Trash' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/admin/collections/tasks/trash'));

    expect(mocks.setPreference).not.toHaveBeenCalled();
  });

  it('turns the tabs into one menu below the small breakpoint', () => {
    mocks.smallBreak = true;

    const { getAllByRole, queryByRole } = render(frame());

    expect(queryByRole('link', { name: 'Board' })).toBeNull();
    expect(getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'List',
      'Board',
      'Trash',
    ]);
    expect(getAllByRole('menuitem')[1]?.getAttribute('aria-current')).toBe('page');
  });

  it('sets the collection plural label as the top-bar label, again on a new collection', () => {
    const { rerender } = render(frame());

    expect(mocks.setStepNav).toHaveBeenLastCalledWith([{ label: 'Tasks' }]);

    mocks.pathname = '/admin/collections/notes/board';
    rerender(frame({ collectionSlug: 'notes' }));

    expect(mocks.setStepNav).toHaveBeenLastCalledWith([{ label: 'Notes' }]);
  });

  it('passes the toolbar to the view controls, and hides Create New behind a CreateButton', () => {
    const toolbar = [<button key="t">Tool</button>];
    const { container } = render(frame({ hasCreateButton: true, Toolbar: toolbar }));
    const props = mocks.ViewControls.mock.lastCall?.[0];

    expect(props?.beforeActions).toBe(toolbar);
    expect(props?.hasCreatePermission).toBe(false);
    expect(container.querySelector('.collection-view__toolbar')).toBeNull();
  });

  it('renders the toolbar in its own row after the view controls on small screens', () => {
    mocks.smallBreak = true;

    const { container, getByRole, getByTestId } = render(
      frame({ Toolbar: [<button key="t">Tool</button>] }),
    );

    const row = container.querySelector('.collection-view__toolbar')!;

    expect(getByRole('button', { name: 'Tool' }).parentElement).toBe(row);
    expect(
      getByTestId('view-controls').compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('replaces the view with its empty state, or keeps it under the empty state', () => {
    const { getByText, queryByTestId, rerender } = render(frame({ isEmpty: true }));

    expect(getByText('Nothing here')).toBeTruthy();
    expect(queryByTestId('view')).toBeNull();

    rerender(frame({ isEmpty: true, keepViewWhenEmpty: true }));

    expect(getByText('Nothing here')).toBeTruthy();
    expect(queryByTestId('view')).not.toBeNull();
  });

  it('places the slots around the view in the same order on every view', () => {
    const { container } = render(
      frame({
        AfterList: <i>after-view</i>,
        AfterListTable: <i>after-table</i>,
        BeforeList: <i>before-view</i>,
        BeforeListTable: <i>before-table</i>,
        Footer: <i>footer</i>,
      }),
    );

    expect(
      [...container.querySelectorAll('main > *')].map((node) => node.className || node.textContent),
    ).toEqual([
      'before-view',
      'list-header',
      '',
      'before-table',
      'collection-view__view',
      'after-table',
      'after-view',
      'footer',
    ]);
  });
});

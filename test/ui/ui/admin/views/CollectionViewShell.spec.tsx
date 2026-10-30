import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const plural: Record<string, string> = { tasks: 'Tasks', notes: 'Notes' };

  return {
    pathname: '/admin/collections/tasks/board',
    plural,
    setStepNav: vi.fn(),
    smallBreak: false,
    ViewControls: vi.fn((_props: { beforeActions?: React.ReactNode[] }) => (
      <div data-testid="view-controls" />
    )),
  };
});

vi.mock('@payloadcms/ui', () => ({
  usePathname: () => mocks.pathname,
  ListHeader: () => null,
  ListQueryProvider: ({ children }: { children: React.ReactNode }) => children,
  TableColumnsProvider: ({ children }: { children: React.ReactNode }) => children,
  useConfig: () => ({
    getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) => ({
      labels: { plural: mocks.plural[collectionSlug], singular: collectionSlug },
      slug: collectionSlug,
    }),
  }),
  useStepNav: () => ({ setStepNav: mocks.setStepNav }),
  useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
  useWindowInfo: () => ({ breakpoints: { s: mocks.smallBreak } }),
}));

vi.mock('../../../../../packages/ui/src/admin/views/controls/ViewControls.client.js', () => ({
  ViewControls: mocks.ViewControls,
}));

const { CollectionViewShellClient } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewShell.client');

function shell(collectionSlug: string, Toolbar?: React.ReactNode[]) {
  return (
    <CollectionViewShellClient
      collectionSlug={collectionSlug}
      hasCreatePermission
      hasDeletePermission
      newDocumentURL={`/admin/collections/${collectionSlug}/create`}
      query={{}}
      Toolbar={Toolbar}
    >
      <div />
    </CollectionViewShellClient>
  );
}

describe('CollectionViewShellClient', () => {
  beforeEach(() => {
    mocks.pathname = '/admin/collections/tasks/board';
    mocks.setStepNav.mockClear();
    mocks.smallBreak = false;
    mocks.ViewControls.mockClear();
  });

  it('sets the collection plural label as the top-bar label', () => {
    render(shell('tasks'));

    expect(mocks.setStepNav).toHaveBeenLastCalledWith([{ label: 'Tasks' }]);
  });

  it('sets the label again when the collection changes', () => {
    const { rerender } = render(shell('tasks'));

    mocks.pathname = '/admin/collections/notes/board';
    rerender(shell('notes'));

    expect(mocks.setStepNav).toHaveBeenLastCalledWith([{ label: 'Notes' }]);
  });

  it('sets the label again when the view path changes while the shell stays mounted', () => {
    const { rerender } = render(shell('tasks'));

    mocks.setStepNav.mockClear();
    mocks.pathname = '/admin/collections/tasks/calendar';
    rerender(shell('tasks'));

    expect(mocks.setStepNav).toHaveBeenCalledWith([{ label: 'Tasks' }]);
  });

  it('passes the toolbar to the view controls, before Filters', () => {
    const toolbar = [<button key="t">Tool</button>];
    const { container } = render(shell('tasks', toolbar));

    expect(mocks.ViewControls.mock.lastCall?.[0].beforeActions).toBe(toolbar);
    expect(container.querySelector('.collection-view-shell__toolbar')).toBeNull();
  });

  it('renders the toolbar in its own row after the view controls on small screens', () => {
    mocks.smallBreak = true;

    const { container, getByRole, getByTestId } = render(
      shell('tasks', [<button key="t">Tool</button>]),
    );

    const row = container.querySelector('.collection-view-shell__toolbar')!;

    expect(getByRole('button', { name: 'Tool' }).parentElement).toBe(row);
    expect(
      getByTestId('view-controls').compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders no toolbar row and no page-body actions row without a toolbar', () => {
    mocks.smallBreak = true;

    const { container } = render(shell('tasks'));

    expect(container.querySelector('.collection-view-shell__toolbar')).toBeNull();
    expect(container.querySelector('.collection-view-shell__actions')).toBeNull();
  });
});

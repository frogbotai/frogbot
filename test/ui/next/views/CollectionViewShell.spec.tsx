import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/admin/collections/tasks/board',
  plural: { tasks: 'Tasks', notes: 'Notes' } as Record<string, string>,
  setStepNav: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
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
}));

vi.mock('next/navigation.js', () => ({ usePathname: () => mocks.pathname }));

vi.mock('../../../../packages/next/src/views/controls/ViewControls.client.js', () => ({
  ViewControls: () => null,
}));

const { CollectionViewShellClient } =
  await import('../../../../packages/next/src/views/CollectionViewShell.client');

function shell(collectionSlug: string) {
  return (
    <CollectionViewShellClient
      collectionSlug={collectionSlug}
      hasCreatePermission
      hasDeletePermission
      newDocumentURL={`/admin/collections/${collectionSlug}/create`}
      query={{}}
    >
      <div />
    </CollectionViewShellClient>
  );
}

describe('CollectionViewShellClient', () => {
  beforeEach(() => {
    mocks.pathname = '/admin/collections/tasks/board';
    mocks.setStepNav.mockClear();
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
});

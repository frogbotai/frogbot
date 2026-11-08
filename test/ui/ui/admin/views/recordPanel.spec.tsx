import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docInfo: {} as Record<string, unknown>,
  fields: [{ name: 'title', type: 'text' }] as Array<Record<string, unknown>>,
  mostRecentUpdate: undefined as Record<string, unknown> | undefined,
  search: new URLSearchParams(),
  serverFunction: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
  ConfirmationModal: () => null,
  LoadingOverlay: () => null,
  RenderFields: () => null,
  toast: { error: vi.fn() },
  useConfig: () => ({
    config: { routes: { admin: '/admin', api: '/api' } },
    getEntityConfig: () => ({
      admin: { custom: { frogbot: { panel: { width: 560 }, views: [] } }, useAsTitle: 'title' },
      fields: mocks.fields,
      labels: { singular: 'Task' },
      slug: 'tasks',
      versions: { drafts: { autosave: { interval: 100 } } },
    }),
  }),
  useDocumentEvents: () => ({ mostRecentUpdate: mocks.mostRecentUpdate }),
  useDocumentInfo: () => mocks.docInfo,
  useField: () => ({ setValue: vi.fn(), value: 'Hello' }),
  useModal: () => ({ closeModal: vi.fn(), modalState: {}, openModal: vi.fn() }),
  usePreferences: () => ({
    getPreference: () => Promise.resolve(undefined),
    setPreference: vi.fn(),
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mocks.search,
  useServerFunctions: () => ({ serverFunction: mocks.serverFunction }),
  useTranslation: () => ({ i18n: { language: 'en', t: (k: string) => k }, t: (k: string) => k }),
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/PanelConfig.client.js', () => ({
  PanelConfig: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePanelLayout: () => ({
    collectionConfig: { fields: mocks.fields, labels: { singular: 'Task' } },
    properties: [],
    titlePath: 'title',
  }),
}));

const { RecordPanelProvider, useRecordPanel } =
  await import('../../../../../packages/ui/src/admin/views/panel/RecordPanelProvider.client.js');

const { RecordPanel } =
  await import('../../../../../packages/ui/src/admin/views/panel/RecordPanel.client.js');

const { useRecordLinks } =
  await import('../../../../../packages/ui/src/admin/views/panel/useRecordLinks.js');

const { RecordPanelTitle } =
  await import('../../../../../packages/ui/src/admin/views/panel/RecordPanelTitle.client.js');

let panel: ReturnType<typeof useRecordPanel>;
const fetchMock = vi.fn(() =>
  Promise.resolve({ json: () => Promise.resolve({ id: 5 }), ok: true }),
);

function Tree({ children, trash = false }: { children?: ReactNode; trash?: boolean }) {
  const ref = useRef<HTMLElement>(null);

  function Capture() {
    panel = useRecordPanel();
    useRecordLinks({ collectionSlug: 'tasks', disabled: trash, viewRef: ref });

    return null;
  }

  return (
    <RecordPanelProvider collectionSlug="tasks">
      <main ref={ref}>
        <Capture />
        {children}
        <RecordPanel viewRef={ref} />
      </main>
    </RecordPanelProvider>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/collections/tasks');
  mocks.docInfo = {};
  mocks.fields = [{ name: 'title', type: 'text' }];
  mocks.search = new URLSearchParams();
  mocks.mostRecentUpdate = undefined;
  mocks.serverFunction.mockReset();
  mocks.serverFunction.mockResolvedValue({ data: {}, Panel: <div id="form" /> });
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

describe('record panel', () => {
  it('keeps its create form when a nested drawer creates a record in the same collection', async () => {
    const { rerender } = render(<Tree />);
    act(() => panel.create({ title: 'typed but unsaved' }));
    await waitFor(() => expect(document.getElementById('form')).not.toBeNull());

    mocks.mostRecentUpdate = {
      doc: { id: 99 },
      drawerSlug: 'doc-drawer_tasks_1_abc',
      entitySlug: 'tasks',
      id: 99,
      operation: 'create',
      updatedAt: 'now',
    };

    rerender(<Tree />);

    expect(panel.state.mode).toBe('create');
    expect(panel.openId).toBeUndefined();
  });

  it('switches to the record its own create form saved', async () => {
    const { rerender } = render(<Tree />);
    act(() => panel.create({}));
    await waitFor(() => expect(document.getElementById('form')).not.toBeNull());

    mocks.mostRecentUpdate = {
      doc: { id: 7 },
      drawerSlug: 'fb-record-panel',
      entitySlug: 'tasks',
      id: 7,
      operation: 'create',
      updatedAt: 'now',
    };

    rerender(<Tree />);

    expect(panel.openId).toBe('7');
  });

  it('reads the draft when it refreshes cards after a save on a drafts collection', async () => {
    mocks.search = new URLSearchParams('record=5');
    const { rerender } = render(<Tree />);
    await waitFor(() => expect(document.getElementById('form')).not.toBeNull());

    mocks.mostRecentUpdate = {
      doc: { _status: 'draft', id: 5, title: 'draft title' },
      drawerSlug: 'fb-record-panel',
      entitySlug: 'tasks',
      id: 5,
      operation: 'update',
      updatedAt: 'now',
    };

    rerender(<Tree />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/[?&]draft=true/);
  });

  it('opens nothing from a trash row', () => {
    render(
      <Tree trash>
        <div className="table">
          <table>
            <tbody>
              <tr data-id="42">
                <td>
                  <a href="/admin/collections/tasks/trash/42">Trashed</a>
                </td>
                <td id="cell">cell</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Tree>,
    );

    act(() => document.getElementById('cell')!.click());

    expect(panel.openId).toBeUndefined();
  });

  it('ignores a link whose path is not valid percent-encoding', () => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };

    const stay = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('error', onError);
    document.addEventListener('click', stay);

    render(
      <Tree>
        <a href="/admin/collections/tasks/%E0%A4%A" id="bad">
          Bad
        </a>
      </Tree>,
    );

    act(() => document.getElementById('bad')!.click());
    window.removeEventListener('error', onError);
    document.removeEventListener('click', stay);

    expect(errors).toEqual([]);
    expect(panel.openId).toBeUndefined();
  });

  it('makes the title read-only without update access to its field', () => {
    mocks.docInfo = {
      docPermissions: { fields: { title: { read: true, update: false } }, update: true },
      hasSavePermission: true,
      isTrashed: false,
    };

    const { container } = render(<RecordPanelTitle />);

    expect(container.querySelector('textarea')?.readOnly).toBe(true);
  });

  it('makes the title read-only when the field is admin.readOnly', () => {
    mocks.docInfo = { docPermissions: { update: true }, hasSavePermission: true, isTrashed: false };
    mocks.fields = [{ admin: { readOnly: true }, name: 'title', type: 'text' }];
    const { container } = render(<RecordPanelTitle />);

    expect(container.querySelector('textarea')?.readOnly).toBe(true);
  });

  it('keeps the title editable with update access', () => {
    mocks.docInfo = {
      docPermissions: { fields: { title: { read: true, update: true } }, update: true },
      hasSavePermission: true,
      isTrashed: false,
    };

    const { container } = render(<RecordPanelTitle />);

    expect(container.querySelector('textarea')?.readOnly).toBe(false);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  docId: 1 as number | undefined,
  notify: vi.fn(),
  open: vi.fn(),
  permissions: { create: true, update: true } as Record<string, boolean>,
  subtasks: {
    name: 'subtasks',
    type: 'join',
    collection: 'todos',
    label: 'Subtasks',
    on: 'parent',
  } as Record<string, unknown>,
}));

vi.mock('@payloadcms/ui', () => ({
  Button: ({ 'aria-label': label, onClick }: { 'aria-label'?: string; onClick?: () => void }) => (
    <button aria-label={label} onClick={onClick} type="button" />
  ),
  toast: { error: vi.fn() },
  useAuth: () => ({ permissions: { collections: { todos: mocks.permissions } } }),
  useConfig: () => ({
    config: { routes: { api: '/api' } },
    getEntityConfig: () => ({
      admin: { custom: { frogbot: { useAsDone: 'done' } }, useAsTitle: 'title' },
      labels: { singular: 'Todo' },
      fields: [{ name: 'title', type: 'text' }, { name: 'done', type: 'checkbox' }, mocks.subtasks],
      slug: 'todos',
    }),
  }),
  useDocumentInfo: () => ({ id: mocks.docId }),
  useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
  withCondition: (Component: unknown) => Component,
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/RecordPanelProvider.client.js', () => ({
  useRecordPanel: () => ({
    collectionSlug: 'todos',
    create: mocks.create,
    notify: mocks.notify,
    open: mocks.open,
  }),
}));

const { PanelJoinField } =
  await import('../../../../../packages/ui/src/admin/views/panel/PanelJoinField.client.js');

const rows = [
  { id: 2, done: false, title: 'Spec the cap rules' },
  { id: 3, done: true, title: 'Price the tiers' },
];

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (init?.method === 'PATCH') {
    return Promise.resolve({
      json: () => Promise.resolve({ doc: { ...rows[0], done: true } }),
      ok: true,
    });
  }

  return Promise.resolve({
    json: () => Promise.resolve({ docs: rows, hasNextPage: false, url }),
    ok: true,
  });
});

beforeEach(() => {
  mocks.create.mockReset();
  mocks.docId = 1;
  mocks.notify.mockReset();
  mocks.open.mockReset();
  mocks.permissions = { create: true, update: true };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

describe('PanelJoinField', () => {
  it('lists the records whose on field is the open record, with the label as heading', async () => {
    render(<PanelJoinField path="subtasks" />);

    await screen.findByRole('button', { name: 'Spec the cap rules' });

    expect(screen.getByRole('heading', { name: 'Subtasks' })).toBeTruthy();
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain(
      'where[parent][equals]=1',
    );
  });

  it('opens a row in the panel with the open record as its parent', async () => {
    render(<PanelJoinField path="subtasks" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Price the tiers' }));

    expect(mocks.open).toHaveBeenCalledWith(3, expect.objectContaining({ from: 'panel' }));
  });

  it('saves a row’s done check in place and tells the views', async () => {
    render(<PanelJoinField path="subtasks" />);

    await screen.findByRole('button', { name: 'Spec the cap rules' });
    const [check] = screen.getAllByRole('button', { name: 'Mark complete' });
    fireEvent.click(check);

    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith({
        doc: { ...rows[0], done: true },
        operation: 'update',
        type: 'saved',
      }),
    );

    expect(screen.getAllByRole('button', { name: 'Completed' })).toHaveLength(2);

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');

    expect(patch?.[1]?.body).toBe(JSON.stringify({ done: true }));
  });

  it('creates a record with its on field set to the open record', () => {
    render(<PanelJoinField path="subtasks" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }));

    expect(mocks.create).toHaveBeenCalledWith({ parent: 1 }, { from: 'panel' });
  });

  it('hides + without create access or with allowCreate false, and the check without update access', async () => {
    mocks.permissions = { create: false, update: false };
    const view = render(<PanelJoinField path="subtasks" />);

    await screen.findByRole('button', { name: 'Spec the cap rules' });

    expect(screen.queryByRole('button', { name: 'Add todo' })).toBeNull();
    expect(
      screen
        .getAllByRole('button', { name: /Mark complete|Completed/ })
        .every((node) => node.hasAttribute('disabled')),
    ).toBe(true);

    view.unmount();
    mocks.permissions = { create: true, update: true };
    mocks.subtasks = { ...mocks.subtasks, admin: { allowCreate: false } };
    render(<PanelJoinField path="subtasks" />);

    expect(screen.queryByRole('button', { name: 'Add todo' })).toBeNull();

    mocks.subtasks = { ...mocks.subtasks, admin: undefined };
  });

  it('renders nothing on a create form', () => {
    mocks.docId = undefined;
    const { container } = render(<PanelJoinField path="subtasks" />);

    expect(container.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docInfo: {} as Record<string, unknown>,
  form: {} as Record<string, { value: unknown }>,
  open: vi.fn(),
  permissions: {} as Record<string, unknown>,
}));

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children }: { children: unknown }) => (
    <button type="button">{children as never}</button>
  ),
  ConfirmationModal: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
  useAuth: () => ({ permissions: mocks.permissions }),
  useConfig: () => ({
    config: { routes: { admin: '/admin', api: '/api' } },
    getEntityConfig: () => ({
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'subtasks', type: 'join', collection: 'tasks', on: 'parent' },
        { name: 'parent', type: 'relationship', relationTo: 'tasks' },
      ],
      labels: { plural: 'Tasks', singular: 'Task' },
      slug: 'tasks',
    }),
  }),
  useDocumentInfo: () => mocks.docInfo,
  useDocumentTitle: () => ({ title: 'Budget feature' }),
  useField: () => ({ setValue: vi.fn(), value: false }),
  useForm: () => ({ submit: vi.fn() }),
  useFormFields: (selector: (state: [Record<string, { value: unknown }>]) => unknown) =>
    selector([mocks.form]),
  useFormModified: () => false,
  useModal: () => ({ closeModal: vi.fn(), openModal: vi.fn() }),
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/PanelConfig.client.js', () => ({
  usePanelLayout: () => ({ titlePath: 'title' }),
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/RecordPanelProvider.client.js', () => ({
  useRecordPanel: () => ({
    back: vi.fn(),
    close: vi.fn(),
    collectionSlug: 'tasks',
    create: vi.fn(),
    expand: vi.fn(),
    guard: vi.fn(),
    notify: vi.fn(),
    open: mocks.open,
    reset: vi.fn(),
    switchTo: vi.fn(),
  }),
}));

const { RecordPanelHeader } =
  await import('../../../../../packages/ui/src/admin/views/panel/RecordPanelHeader.client.js');

const { SidePanelMenuItem } = await import('../../../../../packages/ui/src/index');

function OnlyWhenSaved() {
  return null;
}

beforeEach(() => {
  mocks.permissions = { collections: { tasks: { create: false } } };
  mocks.docInfo = { collectionSlug: 'tasks', hasSavePermission: true };
  mocks.form = {};
  mocks.open.mockReset();
});

describe('record panel header', () => {
  it('links a subtask opened from a view back to its parent task', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ id: 4, title: 'Design the pricing page' }),
        ok: true,
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    mocks.docInfo = { ...mocks.docInfo, id: 9 };
    mocks.form = { parent: { value: 4 } };

    render(<RecordPanelHeader />);

    await user.click(
      await screen.findByRole('button', { name: 'Back to Design the pricing page' }),
    );

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/tasks/4?depth=0');
    expect(mocks.open).toHaveBeenCalledWith('4');

    vi.unstubAllGlobals();
  });

  it('hides the ••• button on a new record when no item applies and the action renders nothing', () => {
    render(<RecordPanelHeader actions={[<OnlyWhenSaved key="a" />]} />);

    expect(screen.queryByRole('button', { name: 'general:moreOptions' })).toBeNull();
  });

  it('shows the ••• button on a new record when an action renders an item', async () => {
    const user = userEvent.setup();

    render(
      <RecordPanelHeader actions={[<SidePanelMenuItem key="a">Track time</SidePanelMenuItem>]} />,
    );

    await user.click(screen.getByRole('button', { name: 'general:moreOptions' }));

    expect(await screen.findByRole('menuitem', { name: 'Track time' })).toBeTruthy();
  });

  it('adds no separator before actions that render nothing', async () => {
    const user = userEvent.setup();
    mocks.docInfo = { collectionSlug: 'tasks', hasSavePermission: true, id: '1' };
    render(<RecordPanelHeader actions={[<OnlyWhenSaved key="a" />]} />);

    await user.click(screen.getByRole('button', { name: 'general:moreOptions' }));
    const menu = await screen.findByRole('menu');

    expect(menu.querySelector('[role="separator"]')).toBeNull();
  });
});

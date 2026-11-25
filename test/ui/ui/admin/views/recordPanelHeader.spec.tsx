import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docInfo: {} as Record<string, unknown>,
  done: false,
  form: {} as Record<string, { value: unknown }>,
  modified: false,
  open: vi.fn(),
  permissions: {} as Record<string, unknown>,
  submit: vi.fn(() => Promise.resolve()),
  useAsDone: undefined as string | undefined,
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
      admin: { custom: { frogbot: { useAsDone: mocks.useAsDone } }, useAsTitle: 'title' },
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
  useField: () => ({
    setValue: (value: boolean) => {
      mocks.done = value;
      mocks.modified = true;
    },
    value: mocks.done,
  }),
  useForm: () => ({ submit: mocks.submit }),
  useFormFields: (selector: (state: [Record<string, { value: unknown }>]) => unknown) =>
    selector([mocks.form]),
  useFormModified: () => mocks.modified,
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
  mocks.done = false;
  mocks.submit.mockReset();

  mocks.submit.mockImplementation(() => {
    mocks.modified = false;

    return Promise.resolve();
  });

  mocks.modified = false;
  mocks.useAsDone = undefined;

  mocks.form = {};
  mocks.open.mockReset();
});

describe('record panel header', () => {
  it('links a subtask opened from a view back to its parent task', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_url: string) =>
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

  it('leads a saved useAsDone record with Mark complete, which saves without a toast', async () => {
    const user = userEvent.setup();
    mocks.useAsDone = 'completed';
    mocks.docInfo = { collectionSlug: 'tasks', hasSavePermission: true, id: '1' };
    const { container } = render(<RecordPanelHeader />);

    const lead = container.querySelector('.fb-side-panel-bar__lead')!;

    await user.click(within(lead as HTMLElement).getByRole('button', { name: 'Mark complete' }));

    expect(mocks.submit).toHaveBeenCalledWith({ disableSuccessStatus: true });
    expect(container.querySelector('.fb-side-panel-bar__status')).toBeNull();
  });

  it('leaves Mark complete out of a new record', () => {
    mocks.useAsDone = 'completed';
    const { container } = render(<RecordPanelHeader />);

    expect(container.querySelector('.fb-side-panel-bar__lead')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark complete' })).toBeNull();
  });

  it('hides Mark complete while unsaved edits wait for Save, so it never saves them', () => {
    mocks.modified = true;
    mocks.useAsDone = 'completed';
    mocks.docInfo = { collectionSlug: 'tasks', hasSavePermission: true, id: '1' };
    render(<RecordPanelHeader />);

    expect(screen.queryByRole('button', { name: 'Mark complete' })).toBeNull();
    expect(screen.getByRole('button', { name: 'general:save' })).toBeTruthy();
  });

  it('never leaves a second quick click unsaved behind Unsaved/Save', async () => {
    const user = userEvent.setup();
    mocks.useAsDone = 'completed';
    mocks.docInfo = { collectionSlug: 'tasks', hasSavePermission: true, id: '1' };
    let busy = false;
    let saved = false;
    let finish = () => {};

    mocks.submit.mockImplementation(() => {
      if (busy) return Promise.resolve();
      busy = true;
      const value = mocks.done;

      return new Promise<void>((resolve) => {
        finish = () => {
          saved = value;
          mocks.modified = false;
          busy = false;
          resolve();
        };
      });
    });

    const { container, rerender } = render(<RecordPanelHeader />);
    const lead = () => container.querySelector<HTMLElement>('.fb-side-panel-bar__lead');

    await user.click(within(lead()!).getByRole('button', { name: 'Mark complete' }));
    rerender(<RecordPanelHeader />);
    await user.click(lead()!.querySelector('button')!);
    rerender(<RecordPanelHeader />);

    await act(async () => {
      finish();
      await Promise.resolve();
    });

    rerender(<RecordPanelHeader />);

    expect({ field: mocks.done, server: saved }).toEqual({ field: true, server: true });
    expect(screen.queryByRole('button', { name: 'general:save' })).toBeNull();
    expect(lead()).not.toBeNull();
  });
});

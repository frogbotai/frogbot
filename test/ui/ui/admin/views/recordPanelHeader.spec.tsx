import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docInfo: {} as Record<string, unknown>,
  modified: false,
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
      fields: [{ name: 'title', type: 'text' }],
      labels: { plural: 'Tasks', singular: 'Task' },
      slug: 'tasks',
    }),
  }),
  useDocumentInfo: () => mocks.docInfo,
  useDocumentTitle: () => ({ title: 'Budget feature' }),
  useField: () => ({ setValue: vi.fn(), value: false }),
  useForm: () => ({ submit: mocks.submit }),
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
  mocks.submit.mockClear();
  mocks.modified = false;
  mocks.useAsDone = undefined;
});

describe('record panel header', () => {
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
});

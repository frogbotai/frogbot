import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docInfo: {} as Record<string, unknown>,
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
      fields: [{ name: 'title', type: 'text' }],
      labels: { plural: 'Tasks', singular: 'Task' },
      slug: 'tasks',
    }),
  }),
  useDocumentInfo: () => mocks.docInfo,
  useDocumentTitle: () => ({ title: 'Budget feature' }),
  useField: () => ({ setValue: vi.fn(), value: false }),
  useForm: () => ({ submit: vi.fn() }),
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
});

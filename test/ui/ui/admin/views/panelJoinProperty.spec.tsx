import { render, screen } from '@testing-library/react';
import { createContext, type ReactNode, use } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  todos: {
    admin: { custom: { frogbot: {} }, useAsTitle: 'title' },
    labels: { singular: 'Todo' },
    fields: [
      { name: 'title', type: 'text' },
      { name: 'parent', type: 'relationship', relationTo: 'todos' },
      {
        name: 'subtasks',
        type: 'join',
        collection: 'todos',
        label: 'Subtasks',
        on: 'parent',
        admin: { position: 'sidebar' },
        targetField: { relationTo: 'todos' },
      },
      { name: 'notes', type: 'textarea' },
    ],
    slug: 'todos',
  } as Record<string, unknown> & { slug: string },
}));

vi.mock('@payloadcms/ui', () => {
  const original = { collections: [mocks.todos], routes: { api: '/api' } };
  const Context = createContext<{ collections: Array<{ slug: string }> } | undefined>(undefined);

  return {
    Button: ({ 'aria-label': label, onClick }: { 'aria-label'?: string; onClick?: () => void }) => (
      <button aria-label={label} onClick={onClick} type="button" />
    ),
    ConfigProvider: ({ children, config }: { children: ReactNode; config: never }) => (
      <Context value={config}>{children}</Context>
    ),
    toast: { error: vi.fn() },
    useAuth: () => ({ permissions: { collections: { todos: { create: true, update: true } } } }),
    useConfig: () => {
      const config = use(Context) ?? original;

      return {
        config: { ...config, routes: { api: '/api' } },
        getEntityConfig: ({ collectionSlug }: { collectionSlug: string }) =>
          config.collections.find((collection) => collection.slug === collectionSlug),
      };
    },
    useDocumentInfo: () => ({ id: 1 }),
    useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
    withCondition: (Component: unknown) => Component,
  };
});

vi.mock('../../../../../packages/ui/src/admin/views/panel/RecordPanelProvider.client.js', () => ({
  useRecordPanel: () => ({
    collectionSlug: 'todos',
    create: vi.fn(),
    notify: vi.fn(),
    open: vi.fn(),
  }),
}));

vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ docs: [{ id: 2, title: 'Child' }], hasNextPage: false }),
      ok: true,
    }),
  ),
);

const { PanelConfig } =
  await import('../../../../../packages/ui/src/admin/views/panel/PanelConfig.client.js');

const { PanelJoinField } =
  await import('../../../../../packages/ui/src/admin/views/panel/PanelJoinField.client.js');

describe('a self-join that is a panel property', () => {
  it('still renders its section when the join sits in the sidebar', async () => {
    render(
      <PanelConfig collectionSlug="todos">
        <PanelJoinField path="subtasks" />
      </PanelConfig>,
    );

    expect(await screen.findByRole('heading', { name: 'Subtasks' })).toBeTruthy();
    expect(await screen.findByText('Child')).toBeTruthy();
  });
});

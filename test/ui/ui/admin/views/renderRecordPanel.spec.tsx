import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docID: undefined as unknown,
  initialState: {} as Record<string, unknown>,
}));

vi.mock('@payloadcms/ui/views/Document/handleServerFunction', async () => {
  const { DocumentInfoProvider } = await import('@payloadcms/ui');

  return {
    renderDocumentHandler: ({ docID }: { docID: unknown }) => {
      mocks.docID = docID;

      return Promise.resolve({
        data: { id: 1 },
        Document: <DocumentInfoProvider initialState={mocks.initialState as never} />,
      });
    },
  };
});

const { renderRecordPanelHandler, sameCollectionJoins } =
  await import('../../../../../packages/ui/src/admin/views/panel/renderRecordPanel.js');

const { PanelJoinField } =
  await import('../../../../../packages/ui/src/admin/views/panel/PanelJoinField.client.js');

const tasks = {
  slug: 'tasks',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'subtasks', type: 'join', collection: 'tasks', on: 'parent' },
    { name: 'notes', type: 'join', collection: 'notes', on: 'task' },
    {
      name: 'blockers',
      type: 'join',
      collection: 'tasks',
      on: 'blocks',
      admin: { components: { Field: '/components/Blockers#Blockers' } },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Plan',
          fields: [
            {
              type: 'row',
              fields: [{ name: 'steps', type: 'join', collection: 'tasks', on: 'step' }],
            },
          ],
        },
        {
          name: 'meta',
          fields: [
            {
              name: 'links',
              type: 'group',
              fields: [{ name: 'related', type: 'join', collection: 'tasks', on: 'related' }],
            },
          ],
        },
      ],
    },
  ],
};

type State = Record<string, { customComponents: Record<string, unknown>; value?: unknown }>;

describe('sameCollectionJoins', () => {
  it('lists joins to the panel’s own collection that set no Field, with their paths', () => {
    expect(sameCollectionJoins(tasks as never)).toEqual([
      'subtasks',
      'steps',
      'meta.links.related',
    ]);
  });
});

describe('renderRecordPanelHandler', () => {
  it('checks admin access before rendering a custom panel', async () => {
    const findByID = vi.fn(() => Promise.resolve({ id: 1, secret: true }));
    const req = {
      i18n: {},
      payload: {
        collections: {
          custom: {
            config: { custom: { frogbot: { panel: { Component: 'x#Y' } } }, slug: 'custom' },
          },
          customers: { config: { access: { admin: () => false }, slug: 'customers' } },
        },
        config: { admin: { user: 'users' } },
        findByID,
      },
      user: { collection: 'customers', id: 3 },
    };

    const outcome = await renderRecordPanelHandler({
      collectionSlug: 'custom',
      id: 1,
      importMap: {},
      permissions: {},
      req,
    } as never).then(
      (value) => value,
      (error: unknown) => ({ error }),
    );

    expect(outcome).toHaveProperty('error');
    expect(findByID).not.toHaveBeenCalled();
  });

  it('renders same-collection joins as a panel section through the form state, with the record’s own id', async () => {
    const custom = <span />;

    mocks.initialState = {
      blockers: { customComponents: { Field: custom } },
      notes: { value: { docs: [] } },
      subtasks: { customComponents: { Label: 'Subtasks' }, value: { docs: [] } },
      title: { value: 'Ship it' },
    };

    const req = {
      i18n: {},
      payload: {
        collections: { tasks: { config: tasks } },
        config: { admin: { user: 'users' } },
        findByID: () => Promise.resolve({ id: 1 }),
      },
      user: { collection: 'users', id: 3 },
    };

    const result = await renderRecordPanelHandler({
      collectionSlug: 'tasks',
      id: '1',
      importMap: {},
      permissions: {},
      req,
    } as never);

    const Panel = (result as { Panel: ReactElement<{ initialState: State }> }).Panel;

    expect(isValidElement(Panel)).toBe(true);

    const state = Panel.props.initialState;
    const field = state.subtasks.customComponents.Field as ReactElement<{ path: string }>;

    expect(mocks.docID).toBe(1);
    expect(field.type).toBe(PanelJoinField);
    expect(field.props.path).toBe('subtasks');
    expect(state.subtasks.customComponents.Label).toBe('Subtasks');
    expect(state.subtasks.value).toEqual({ docs: [] });
    expect(state.notes.customComponents).toBeUndefined();
    expect(state.blockers.customComponents.Field).toBe(custom);
    expect(state.title).toEqual({ value: 'Ship it' });
    expect(mocks.initialState.subtasks).toEqual({
      customComponents: { Label: 'Subtasks' },
      value: { docs: [] },
    });
  });
});

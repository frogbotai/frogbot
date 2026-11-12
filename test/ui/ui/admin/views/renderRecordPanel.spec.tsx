import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@payloadcms/ui/views/Document/handleServerFunction', () => ({
  renderDocumentHandler: () =>
    Promise.resolve({ data: { id: 1, title: 'Hello' }, Document: <div data-document /> }),
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: ({ Component }: { Component: string }) => <span data-slot={Component} />,
}));

const { renderRecordPanelHandler } =
  await import('../../../../../packages/ui/src/admin/views/panel/renderRecordPanel.js');

const { RecordPanelTabList, RecordPanelTabPanes } =
  await import('../../../../../packages/ui/src/admin/views/panel/RecordPanelTabs.client.js');

function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = find(child, type);
      if (found) return found;
    }

    return undefined;
  }

  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  if (node.type === type) return node;

  return find(node.props.children as ReactNode, type);
}

async function renderPanel(panel: Record<string, unknown>, { create = false } = {}) {
  const req = {
    i18n: { t: (key: string) => `t(${key})` },
    payload: {
      collections: { tasks: { config: { custom: { frogbot: { panel } }, slug: 'tasks' } } },
      config: { admin: { user: 'users' } },
      findByID: () => Promise.resolve({ id: 1 }),
    },
    user: { collection: 'users', id: 3 },
  };

  const result = await renderRecordPanelHandler({
    collectionSlug: 'tasks',
    id: create ? undefined : 1,
    importMap: {},
    permissions: {},
    req,
  } as never);

  if (result.notFound) throw new Error('not found');
  const props = (result.Panel as ReactElement<{ AfterFields: ReactNode; BeforeFields: ReactNode }>)
    .props;

  return {
    list: find(props.BeforeFields, RecordPanelTabList),
    panes: find(props.AfterFields, RecordPanelTabPanes),
  };
}

const tabs = [
  { Component: './History#History', label: 'History' },
  { Component: './Links#Links', label: ({ t }: { t: (key: string) => string }) => t('links') },
];

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

  it('renders no tab bar when the collection adds no tabs', async () => {
    const { list, panes } = await renderPanel({ afterFields: ['./After#After'] });

    expect(list).toBeUndefined();
    expect(panes).toBeUndefined();
  });

  it('renders the tab labels, string and function, and a pane per tab', async () => {
    const { list, panes } = await renderPanel({ tabs });

    expect(list?.props.labels).toEqual(['History', 't(links)']);

    const rendered = panes?.props.panes as ReactNode[];

    expect(rendered).toHaveLength(2);
    expect(find(rendered, 'span')?.props['data-slot']).toBe('./History#History');
  });

  it('shows no tabs on a create form', async () => {
    const { list, panes } = await renderPanel({ tabs }, { create: true });

    expect(list).toBeUndefined();
    expect(panes).toBeUndefined();
  });
});

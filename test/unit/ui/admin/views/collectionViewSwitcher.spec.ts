import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  render: vi.fn(() => 'rendered'),
  resolveCollectionViews: vi.fn(),
  ViewDescription: () => null,
  ViewSwitcher: () => null,
}));

vi.mock('@payloadcms/ui', () => ({ ViewDescription: mocks.ViewDescription }));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.render,
}));

vi.mock('../../../../../packages/ui/src/admin/elements/ViewSwitcher/index.client.js', () => ({
  ViewSwitcher: mocks.ViewSwitcher,
}));

vi.mock('../../../../../packages/ui/src/admin/views/collectionViews.js', () => ({
  getActiveViewSlug: () => 'board',
  resolveCollectionViews: mocks.resolveCollectionViews,
}));

const { CollectionViewSwitcher } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewSwitcher.js');

type Props = Parameters<typeof CollectionViewSwitcher>[0];

const toProps = (value: object) => value as Props;

const views = [
  { label: 'List', path: '', slug: 'list' },
  { label: 'Board', path: '/board', slug: 'board' },
];

const importMap = { './Description#Description': () => null };

function documentProps({ custom, ...rest }: { custom?: object; description?: unknown }) {
  return toProps({
    collectionSlug: 'tasks',
    payload: { collections: { tasks: { config: { admin: { custom } } } }, importMap },
    ...rest,
  });
}

beforeEach(() => {
  mocks.render.mockClear();
  mocks.resolveCollectionViews.mockReset();
  mocks.resolveCollectionViews.mockResolvedValue({ runtime: views, views });
});

describe('CollectionViewSwitcher on the document page', () => {
  it.each([
    ['a string', 'Tasks for the team.'],
    ['a per-locale record', { en: 'Tasks', es: 'Tareas' }],
  ])('renders %s description without the view tabs', async (_, description) => {
    const element = (await CollectionViewSwitcher(documentProps({ description }))) as ReactElement;

    expect(element.type).toBe(mocks.ViewDescription);
    expect(element.props).toEqual({ collectionSlug: 'tasks', description });
    expect(mocks.resolveCollectionViews).not.toHaveBeenCalled();
  });

  it("renders the collection's description component with Payload's client props", async () => {
    const props = documentProps({
      custom: { frogbot: { descriptionComponent: './Description#Description' } },
      description: 'Tasks for the team.',
    });

    expect(await CollectionViewSwitcher(props)).toBe('rendered');
    expect(mocks.render).toHaveBeenCalledExactlyOnceWith({
      clientProps: { collectionSlug: 'tasks', description: 'Tasks for the team.' },
      Component: './Description#Description',
      importMap,
      serverProps: expect.objectContaining({ collectionSlug: 'tasks' }),
    });
  });

  it('renders nothing without a description or component', async () => {
    expect(await CollectionViewSwitcher(documentProps({}))).toBeNull();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('renders nothing without a collection', async () => {
    expect(await CollectionViewSwitcher(toProps({ description: 'Tasks' }))).toBeNull();
  });
});

describe('CollectionViewSwitcher on a list page', () => {
  it('renders the description, then the view tabs', async () => {
    const element = (await CollectionViewSwitcher(
      toProps({
        collectionConfig: { admin: { description: 'Tasks for the team.' }, slug: 'tasks' },
        collectionSlug: 'tasks',
        importMap,
      }),
    )) as ReactElement<{ children: ReactElement[] }>;

    const [description, switcher] = element.props.children;

    expect(description?.type).toBe(mocks.ViewDescription);
    expect(description?.props).toEqual({
      collectionSlug: 'tasks',
      description: 'Tasks for the team.',
    });
    expect(switcher?.type).toBe(mocks.ViewSwitcher);
    expect(switcher?.props).toEqual({ collectionSlug: 'tasks', viewSlug: 'board', views });
  });
});

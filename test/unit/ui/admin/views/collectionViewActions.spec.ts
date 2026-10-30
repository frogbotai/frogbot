import type * as frogbotInternalModule from 'frogbot/internal';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  RenderServerComponent: vi.fn(() => 'rendered'),
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));

vi.mock('frogbot/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof frogbotInternalModule>()),
  attachRegisteredFrogBot: (req: object) => req,
}));

const { CollectionViewActions } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewActions.js');

const actions = ['./Header#Action'];

function tasks(access?: () => boolean) {
  return {
    config: {
      admin: {
        custom: {
          frogbot: {
            views: [
              { label: 'List', path: '', slug: 'list', type: 'list' },
              { label: 'Board', path: '/board', slug: 'board', type: 'board' },
            ],
          },
        },
      },
      custom: {
        frogbot: {
          collectionViews: [
            { slug: 'list', type: 'list', components: { actions: ['./List#Action'] } },
            { access, slug: 'board', type: 'board', components: { actions } },
          ],
        },
      },
      slug: 'tasks',
    },
  };
}

function props(overrides: Record<string, unknown> = {}, access?: () => boolean) {
  return {
    collectionSlug: 'tasks',
    payload: {
      collections: { tasks: tasks(access) },
      config: { routes: { admin: '/admin' } },
      importMap: { map: true },
    },
    permissions: { collections: { tasks: { create: true, delete: false } } },
    req: { user: { id: 'u1' } },
    viewType: 'board',
    ...overrides,
  } as never;
}

describe('CollectionViewActions', () => {
  beforeEach(() => {
    mocks.RenderServerComponent.mockClear();
  });

  it("renders a non-default view's actions with the collection client props", async () => {
    const input = props();

    expect(await CollectionViewActions(input)).toBe('rendered');
    expect(mocks.RenderServerComponent).toHaveBeenCalledWith({
      clientProps: {
        collectionSlug: 'tasks',
        hasCreatePermission: true,
        hasDeletePermission: false,
        newDocumentURL: '/admin/collections/tasks/create',
      },
      Component: actions,
      importMap: { map: true },
      serverProps: input,
    });
  });

  it.each([
    ['outside a collection', { collectionSlug: undefined }],
    ['on a route that is not a FrogBot view', { viewType: 'document' }],
    ['on the default view, whose actions Payload renders', { viewType: 'list' }],
    ['on a document route', { docID: 1 }],
    ['for an unknown collection', { collectionSlug: 'missing' }],
  ])('renders nothing %s', async (_case, overrides) => {
    expect(await CollectionViewActions(props(overrides))).toBeNull();
    expect(mocks.RenderServerComponent).not.toHaveBeenCalled();
  });

  it('renders nothing when the user cannot open the view', async () => {
    const access = vi.fn(() => false);

    expect(await CollectionViewActions(props({}, access))).toBeNull();
    expect(access).toHaveBeenCalledWith({ req: { user: { id: 'u1' } } });
    expect(mocks.RenderServerComponent).not.toHaveBeenCalled();
  });
});

import type * as frogbotInternalModule from 'frogbot/internal';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ RenderServerComponent: vi.fn(() => 'rendered') }));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));

vi.mock('frogbot/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof frogbotInternalModule>()),
  attachRegisteredFrogBot: (req: object) => req,
}));

const { compileCollectionViews } =
  await import('../../../../../packages/frogbot/src/config/collectionViews.js');

const { getCustomCollectionViewByRoute } =
  await import('../../../../../packages/ui/node_modules/@payloadcms/ui/dist/views/Root/getCustomCollectionViewByRoute.js');

const { CollectionViewActions } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewActions.js');

function render(views: unknown[], path: string) {
  let runtime: unknown;
  const admin = compileCollectionViews({
    collection: {
      slug: 'tickets',
      fields: [{ name: 'status', type: 'select', options: [] }],
      admin: { views },
    } as never,
    onRuntimeViews: (value) => {
      runtime = value;
    },
  });

  const { viewKey } = getCustomCollectionViewByRoute({
    adminRoute: '/admin',
    baseRoute: '/collections/tickets',
    currentRoute: `/admin/collections/tickets${path}`,
    views: admin?.components?.views as never,
  });

  const collectionConfig = {
    slug: 'tickets',
    admin,
    custom: { frogbot: { collectionViews: runtime } },
  };

  mocks.RenderServerComponent.mockClear();

  return CollectionViewActions({
    collectionSlug: 'tickets',
    payload: {
      collections: { tickets: { config: collectionConfig } },
      config: { routes: { admin: '/admin' } },
      importMap: {},
    },
    permissions: { collections: { tickets: { create: true } } },
    req: { user: { id: 'u1' } },
    viewType: viewKey,
  } as never);
}

describe('header actions of a later view on its own route', () => {
  it("renders a later board's actions", async () => {
    expect(
      await render(
        [
          { type: 'list' },
          { type: 'board', groupBy: 'status', components: { actions: ['./B#B'] } },
        ],
        '/board',
      ),
    ).toBe('rendered');
  });

  it("renders a later list's actions on its route", async () => {
    expect(
      await render(
        [
          { type: 'board', groupBy: 'status' },
          { type: 'list', components: { actions: ['./L#L'] } },
        ],
        '/list',
      ),
    ).toBe('rendered');
  });
});

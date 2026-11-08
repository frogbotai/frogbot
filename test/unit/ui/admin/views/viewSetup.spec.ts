import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  upsertPreferences: vi.fn(),
}));

vi.mock('@payloadcms/ui/utilities/upsertPreferences', () => mocks);

const { isFreshQuery, mergeViewSetup, pickViewSetup, resolveViewSetup } =
  await import('../../../../../packages/ui/src/admin/views/viewSetup.js');

const req = { payload: {}, user: { collection: 'users', id: 'u1' } } as never;

describe('view setups', () => {
  beforeEach(() => {
    mocks.getPreferences.mockReset();
    mocks.upsertPreferences.mockReset();
  });

  it('treats a URL with no columns, group, page size, sort or filters as fresh', () => {
    expect(isFreshQuery({})).toBe(true);
    expect(isFreshQuery({ date: '2026-06-15', page: '2', search: 'acme' })).toBe(true);
    expect(isFreshQuery({ groupBy: '' })).toBe(false);
    expect(isFreshQuery({ where: { title: { equals: 'x' } } })).toBe(false);
  });

  it('picks only the setup keys', () => {
    expect(
      pickViewSetup({
        collapsed: ['a'],
        columns: ['title'],
        date: 'x',
        limit: '25',
        sort: '-title',
      }),
    ).toEqual({ columns: ['title'], limit: '25', sort: '-title' });
  });

  it('keeps what the URL leaves out, but drops filters the URL no longer has', () => {
    const existing = {
      collapsed: ['done'],
      columns: ['title'],
      sort: 'title',
      where: { status: { equals: 'open' } },
    };

    expect(mergeViewSetup(existing, { sort: '-title' })).toEqual({
      collapsed: ['done'],
      columns: ['title'],
      sort: '-title',
    });
    expect(mergeViewSetup(existing, { where: { status: { equals: 'won' } } })).toMatchObject({
      sort: 'title',
      where: { status: { equals: 'won' } },
    });
  });

  it('opens the saved setup on a fresh URL without saving anything', async () => {
    mocks.getPreferences.mockResolvedValue({
      id: 1,
      value: { collapsed: ['x'], sort: '-title', where: { a: { equals: 1 } } },
    });

    const setup = await resolveViewSetup({
      collectionSlug: 'tasks',
      query: { date: '2026-06-15' },
      req,
      viewSlug: 'board',
    });

    expect(mocks.getPreferences).toHaveBeenCalledWith(
      'collection-tasks-view-board',
      {},
      'u1',
      'users',
    );
    expect(mocks.upsertPreferences).not.toHaveBeenCalled();
    expect(setup).toMatchObject({
      fresh: true,
      preferenceKey: 'collection-tasks-view-board',
      query: { date: '2026-06-15', sort: '-title', where: { a: { equals: 1 } } },
    });
  });

  it("saves the URL's setup and renders the URL as it is", async () => {
    mocks.upsertPreferences.mockImplementation(({ customMerge, value }) =>
      Promise.resolve(customMerge({ where: { old: { equals: 1 } }, collapsed: [] }, value)),
    );

    const setup = await resolveViewSetup({
      collectionSlug: 'tasks',
      query: { columns: '["title"]', page: '1' },
      req,
      viewSlug: 'list',
    });

    expect(mocks.upsertPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'collection-tasks-view-list',
        value: { columns: '["title"]' },
      }),
    );
    expect(setup.preference).toEqual({ collapsed: [], columns: '["title"]' });
    expect(setup.query).toEqual({ columns: '["title"]', page: '1' });
  });
});

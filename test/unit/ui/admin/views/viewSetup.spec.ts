import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  upsertPreferences: vi.fn(),
}));

vi.mock('@payloadcms/ui/utilities/upsertPreferences', () => mocks);

const { isFreshQuery, mergeViewSetup, pickViewSetup, resolveViewSetup } =
  await import('../../../../../packages/ui/src/admin/views/viewSetup.js');

const count = vi.fn();
const req = { payload: { count }, user: { collection: 'users', id: 'u1' } } as never;
const queryError = () =>
  Object.assign(new Error('The following path cannot be queried'), {
    name: 'QueryError',
  });

describe('view setups', () => {
  beforeEach(() => {
    mocks.getPreferences.mockReset();
    mocks.upsertPreferences.mockReset();
    count.mockReset();
    count.mockResolvedValue({ totalDocs: 1 });
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
      { count },
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

  it('ignores a saved value that is not an object', () => {
    expect(mergeViewSetup('abc' as never, { sort: 'title' })).toEqual({ sort: 'title' });
    expect(mergeViewSetup(['a'] as never, { sort: 'title' })).toEqual({ sort: 'title' });
  });

  it('does not save filters the database refuses', async () => {
    count.mockRejectedValue(queryError());
    mocks.getPreferences.mockResolvedValue({ id: 1, value: { sort: 'title' } });

    const where = { nonexistentField: { equals: 'x' } };
    const setup = await resolveViewSetup({
      collectionSlug: 'tasks',
      query: { where },
      req,
      viewSlug: 'board',
    });

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tasks', overrideAccess: false, where }),
    );
    expect(mocks.upsertPreferences).not.toHaveBeenCalled();
    expect(setup.preference).toEqual({ sort: 'title' });
  });

  it('drops saved filters the database now refuses, so the plain view opens', async () => {
    count.mockRejectedValue(queryError());

    mocks.getPreferences.mockResolvedValue({
      id: 1,
      value: { sort: 'title', where: { renamed: { equals: 'x' } } },
    });

    mocks.upsertPreferences.mockImplementation(({ customMerge, value }) =>
      Promise.resolve(customMerge({ sort: 'title', where: { renamed: { equals: 'x' } } }, value)),
    );

    const setup = await resolveViewSetup({
      collectionSlug: 'tasks',
      query: {},
      req,
      viewSlug: 'board',
    });

    expect(setup.query).toEqual({ sort: 'title' });
    expect(setup.preference).toEqual({ sort: 'title' });
  });

  it('still fails on errors other than a refused query', async () => {
    count.mockRejectedValue(new Error('database down'));

    await expect(
      resolveViewSetup({
        collectionSlug: 'tasks',
        query: { where: { title: { equals: 'x' } } },
        req,
        viewSlug: 'board',
      }),
    ).rejects.toThrow('database down');
  });
});

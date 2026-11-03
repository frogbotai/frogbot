import { describe, expect, it, vi } from 'vitest';

import type { PaletteCollection } from '../../../../../../packages/ui/src/admin/elements/CommandPalette/buildPaletteModel';
import {
  buildRecordRequests,
  searchCollection,
} from '../../../../../../packages/ui/src/admin/elements/CommandPalette/searchRecords';

const tasks: PaletteCollection = {
  index: 'content',
  label: 'Tasks',
  searchFields: ['title', 'code'],
  slug: 'tasks',
  titleField: 'title',
};

const projects: PaletteCollection = {
  label: 'Projects',
  searchFields: ['name'],
  slug: 'projects',
  titleField: 'name',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fakeFetch(responses: { contains?: Response | Error; index?: Response | Error }) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = String(input).endsWith('/search') ? responses.index : responses.contains;

    if (init?.signal?.aborted) return Promise.reject(init.signal.reason as Error);

    if (response instanceof Error) return Promise.reject(response);

    return Promise.resolve(response ?? json({ docs: [] }));
  });
}

describe('buildRecordRequests', () => {
  it('builds no request for whitespace', () => {
    expect(buildRecordRequests({ apiRoute: '/api', collection: tasks, text: '   ' })).toEqual([]);
  });

  it('builds the list-search "contains" query on the search fields', () => {
    const [contains] = buildRecordRequests({
      apiRoute: '/api/',
      collection: projects,
      text: ' acm ',
    });

    const [path, search] = contains.url.split('?');

    expect(contains.init.method).toBe('GET');
    expect(path).toBe('/api/projects');
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      depth: '0',
      limit: '5',
      'select[name]': 'true',
      'where[or][0][name][like]': 'acm',
    });
  });

  it('adds the index request when the collection has an index', () => {
    const requests = buildRecordRequests({ apiRoute: '/api', collection: tasks, text: 'acme' });

    expect(requests.map(({ kind }) => kind)).toEqual(['contains', 'index']);

    const where = [...new URLSearchParams(requests[0].url.split('?')[1])].filter(([key]) =>
      key.startsWith('where'),
    );

    expect(Object.fromEntries(where)).toEqual({
      'where[or][0][title][like]': 'acme',
      'where[or][1][code][like]': 'acme',
    });

    expect(requests[1].url).toBe('/api/tasks/search');
    expect(requests[1].init.method).toBe('POST');
    expect(JSON.parse(requests[1].init.body as string)).toEqual({
      index: 'content',
      limit: 5,
      query: { text: 'acme' },
      select: { title: true },
    });
  });
});

describe('searchCollection', () => {
  it('sends nothing for whitespace', async () => {
    const fetch = fakeFetch({});

    await expect(
      searchCollection({ apiRoute: '/api', collection: tasks, fetch, text: ' ' }),
    ).resolves.toEqual([]);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('puts "contains" matches first, drops duplicates and caps at 5', async () => {
    const fetch = fakeFetch({
      contains: json({
        docs: [
          { id: 1, title: 'Acme' },
          { id: 2, title: '' },
        ],
      }),
      index: json({
        hits: [1, 3, 4, 5, 6, 7].map((id) => ({ doc: { id, title: `Hit ${id}` }, score: 1 })),
      }),
    });

    await expect(
      searchCollection({ apiRoute: '/api', collection: tasks, fetch, text: 'acme' }),
    ).resolves.toEqual([
      { id: 1, title: 'Acme' },
      { id: 2, title: '2' },
      { id: 3, title: 'Hit 3' },
      { id: 4, title: 'Hit 4' },
      { id: 5, title: 'Hit 5' },
    ]);
  });

  it('keeps "contains" results when only the index request fails', async () => {
    const fetch = fakeFetch({
      contains: json({ docs: [{ id: 'a', title: 'Acme' }] }),
      index: json({ errors: [] }, 400),
    });

    await expect(
      searchCollection({ apiRoute: '/api', collection: tasks, fetch, text: 'acme' }),
    ).resolves.toEqual([{ id: 'a', title: 'Acme' }]);
  });

  it('rejects when every request fails', async () => {
    const fetch = fakeFetch({
      contains: json({ errors: [] }, 403),
      index: new TypeError('network'),
    });

    await expect(
      searchCollection({ apiRoute: '/api', collection: tasks, fetch, text: 'acme' }),
    ).rejects.toThrow('/api/tasks?');
  });

  it('passes the abort signal through and rejects once aborted', async () => {
    const controller = new AbortController();
    const fetch = fakeFetch({});

    controller.abort();

    await expect(
      searchCollection({
        apiRoute: '/api',
        collection: projects,
        fetch,
        signal: controller.signal,
        text: 'acme',
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetch.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

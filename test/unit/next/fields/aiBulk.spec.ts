import { describe, expect, it } from 'vitest';

import { aiField } from '../../../../packages/frogbot/src/fields/baseFields/ai/index.js';
import {
  AI_BULK_CHUNK_SIZE,
  type AIBulkChoice,
  type AIBulkField,
  type AIBulkTarget,
  aiBulkChoiceFilter,
  aiBulkLoadURL,
  aiBulkMenuFields,
  aiBulkRequests,
  aiBulkResultMessage,
  aiBulkScope,
  aiBulkTargets,
} from '../../../../packages/next/src/fields/AI/bulk.js';

const api = '/api';
const statusPath = '_summary_status';
const summary: AIBulkField = { inputs: ['title', 'notes'], label: 'Summary', name: 'summary' };

const skipped = 'skipped (no inputs, no permission, being edited, or changed)';

const collectionConfig = {
  admin: { listSearchableFields: ['title', 'notes'], useAsTitle: 'title' },
  slug: 'tasks',
} as never;

const taskFields = [
  { name: 'title', type: 'text' },
  { name: 'notes', type: 'text' },
  { name: 'secret', type: 'text' },
  aiField({ name: 'summary', inputs: ['title', 'notes', 'secret'], prompt: 'Summarize.' }),
  aiField({ name: 'category', inputs: ['summary'], prompt: 'Categorize.', model: 'test/other' }),
] as never;

const menuArgs = { canUpdate: true, fields: taskFields, isInDrawer: false, viewType: 'list' };

function query(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, 'http://localhost').searchParams);
}

function path(url: string): string {
  return new URL(url, 'http://localhost').pathname;
}

function targets(count: number, draft = false): AIBulkTarget[] {
  return Array.from({ length: count }, (_, index) => ({
    draft,
    id: `${draft ? 'd' : 'p'}${index}`,
  }));
}

describe('aiBulkMenuFields', () => {
  it('returns one entry per AI field with the marker inputs', () => {
    const fields = aiBulkMenuFields(menuArgs);

    expect(fields).toEqual([
      { inputs: ['title', 'notes', 'secret'], label: undefined, name: 'summary' },
      { inputs: ['summary'], label: undefined, name: 'category' },
    ]);
  });

  it('finds an AI field inside a row and keeps its label', () => {
    const fields = aiBulkMenuFields({
      ...menuArgs,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'body', type: 'text' },
            aiField({ name: 'gist', inputs: ['body'], label: 'Gist', prompt: 'Sum up.' }),
          ],
        },
      ] as never,
    });

    expect(fields).toEqual([{ inputs: ['body'], label: 'Gist', name: 'gist' }]);
  });

  it('gives the same entry when the marker sets a model', () => {
    const withModel = aiBulkMenuFields({
      ...menuArgs,
      fields: [
        aiField({ name: 'gist', inputs: ['body'], prompt: 'Sum up.', model: 'test/a' }),
      ] as never,
    });

    const withoutModel = aiBulkMenuFields({
      ...menuArgs,
      fields: [aiField({ name: 'gist', inputs: ['body'], prompt: 'Sum up.' })] as never,
    });

    expect(withModel).toEqual(withoutModel);
  });

  it('ignores fields that are not AI fields', () => {
    const fields = aiBulkMenuFields({
      ...menuArgs,
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'price',
          type: 'number',
          admin: { custom: { frogbot: { kind: { type: 'money' } } } },
        },
      ] as never,
    });

    expect(fields).toEqual([]);
  });

  it('returns nothing without update permission', () => {
    expect(aiBulkMenuFields({ ...menuArgs, canUpdate: false })).toEqual([]);
  });

  it('returns nothing in the trash view', () => {
    expect(aiBulkMenuFields({ ...menuArgs, viewType: 'trash' })).toEqual([]);
  });

  it('returns nothing in a drawer', () => {
    expect(aiBulkMenuFields({ ...menuArgs, isInDrawer: true })).toEqual([]);
  });
});

describe('aiBulkScope', () => {
  const where = { notes: { equals: 'x' } };

  it.each(['some', 'allInPage'])('limits a %s selection to the selected IDs', (selectAll) => {
    const scope = aiBulkScope({
      collectionConfig,
      query: { search: 'alpha', where },
      selectAll,
      selectedIDs: [1, 2],
    });

    expect(scope).toEqual({ hasSelection: true, where: { id: { in: [1, 2] } } });
  });

  it('combines the filter and search after select all', () => {
    const scope = aiBulkScope({
      collectionConfig,
      query: { search: 'alpha', where },
      selectAll: 'allAvailable',
      selectedIDs: [],
    });

    expect(scope).toEqual({
      hasSelection: true,
      where: {
        and: [where, { or: [{ title: { like: 'alpha' } }, { notes: { like: 'alpha' } }] }],
      },
    });
  });

  it('covers the whole view with nothing selected', () => {
    const scope = aiBulkScope({
      collectionConfig,
      query: { search: 'alpha', where },
      selectAll: 'none',
      selectedIDs: [],
    });

    expect(scope).toEqual({
      hasSelection: false,
      where: {
        and: [where, { or: [{ title: { like: 'alpha' } }, { notes: { like: 'alpha' } }] }],
      },
    });
  });

  it('keeps the filter alone without a search', () => {
    const scope = aiBulkScope({
      collectionConfig,
      query: { where },
      selectAll: 'none',
      selectedIDs: [],
    });

    expect(scope.where).toEqual({ and: [where] });
  });

  it('gives an empty where with no filter and no search', () => {
    const scope = aiBulkScope({ collectionConfig, query: {}, selectAll: 'none', selectedIDs: [] });

    expect(scope.where).toEqual({});
  });

  it('gives a valid load URL for an empty where', () => {
    const scope = aiBulkScope({ collectionConfig, query: {}, selectAll: 'none', selectedIDs: [] });

    const url = aiBulkLoadURL({
      api,
      choice: 'failed',
      collectionSlug: 'tasks',
      drafts: false,
      field: summary,
      where: scope.where,
    });

    expect(query(url)).toMatchObject({ [`where[and][0][${statusPath}][equals]`]: 'error' });
  });
});

describe('aiBulkChoiceFilter', () => {
  it.each<[AIBulkChoice, unknown]>([
    [
      'all',
      {
        or: [
          { [statusPath]: { exists: false } },
          { [statusPath]: { in: ['done', 'error', 'manual'] } },
        ],
      },
    ],
    ['generated', { [statusPath]: { equals: 'done' } }],
    ['failed', { [statusPath]: { equals: 'error' } }],
    ['never', { [statusPath]: { exists: false } }],
  ])('filters %s on the status path', (choice, filter) => {
    expect(aiBulkChoiceFilter({ choice, statusPath })).toEqual(filter);
  });
});

describe('aiBulkLoadURL', () => {
  const where = { id: { in: [1, 2] } };

  const base = {
    api,
    collectionSlug: 'tasks',
    drafts: false,
    field: summary,
    where,
  };

  it('loads the collection without pagination at depth 0', () => {
    const url = aiBulkLoadURL({ ...base, choice: 'failed' });

    expect(path(url)).toBe('/api/tasks');
    expect(query(url)).toMatchObject({ depth: '0', pagination: 'false' });
  });

  it.each<[AIBulkChoice, Record<string, string>]>([
    [
      'all',
      {
        [`where[and][1][or][0][${statusPath}][exists]`]: 'false',
        [`where[and][1][or][1][${statusPath}][in][0]`]: 'done',
        [`where[and][1][or][1][${statusPath}][in][1]`]: 'error',
        [`where[and][1][or][1][${statusPath}][in][2]`]: 'manual',
      },
    ],
    ['generated', { [`where[and][1][${statusPath}][equals]`]: 'done' }],
    ['failed', { [`where[and][1][${statusPath}][equals]`]: 'error' }],
    ['never', { [`where[and][1][${statusPath}][exists]`]: 'false' }],
  ])('combines the scope with the %s filter', (choice, filter) => {
    const url = aiBulkLoadURL({ ...base, choice });

    expect(query(url)).toMatchObject({
      'where[and][0][id][in][0]': '1',
      'where[and][0][id][in][1]': '2',
      ...filter,
    });
  });

  it('selects only the inputs without drafts', () => {
    const url = aiBulkLoadURL({ ...base, choice: 'failed' });

    const selected = Object.keys(query(url)).filter((key) => key.startsWith('select'));

    expect(selected).toEqual(['select[title]', 'select[notes]']);
    expect(query(url)).not.toHaveProperty('draft');
  });

  it('selects the draft status and reads drafts on draft collections', () => {
    const url = aiBulkLoadURL({ ...base, choice: 'failed', drafts: true });

    expect(query(url)).toMatchObject({
      draft: 'true',
      'select[_status]': 'true',
      'select[notes]': 'true',
      'select[title]': 'true',
    });
  });

  it('passes the locale without fallback when given', () => {
    const url = aiBulkLoadURL({ ...base, choice: 'failed', locale: 'fr' });

    expect(query(url)).toMatchObject({ 'fallback-locale': 'none', locale: 'fr' });
  });

  it('leaves the locale out when not given', () => {
    const url = aiBulkLoadURL({ ...base, choice: 'failed' });

    expect(query(url)).not.toHaveProperty('locale');
    expect(query(url)).not.toHaveProperty('fallback-locale');
  });
});

describe('aiBulkTargets', () => {
  it.each([[null], [''], [[]], [undefined]])('drops a record whose inputs are all %j', (value) => {
    const docs = [{ id: 1, notes: value, title: value }];

    expect(aiBulkTargets({ docs, drafts: false, field: summary })).toEqual([]);
  });

  it('drops a record whose inputs are absent from the response', () => {
    expect(aiBulkTargets({ docs: [{ id: 1 }], drafts: false, field: summary })).toEqual([]);
  });

  it('keeps a record with one input set', () => {
    const docs = [{ id: 1, notes: null, title: 'Alpha' }];

    expect(aiBulkTargets({ docs, drafts: false, field: summary })).toEqual([
      { draft: false, id: 1 },
    ]);
  });

  it('marks drafts on draft collections', () => {
    const docs = [
      { _status: 'draft', id: 1, title: 'Alpha' },
      { _status: 'published', id: 2, title: 'Beta' },
    ];

    expect(aiBulkTargets({ docs, drafts: true, field: summary })).toEqual([
      { draft: true, id: 1 },
      { draft: false, id: 2 },
    ]);
  });

  it('marks no drafts on collections without drafts', () => {
    const docs = [{ _status: 'draft', id: 1, title: 'Alpha' }];

    expect(aiBulkTargets({ docs, drafts: false, field: summary })).toEqual([
      { draft: false, id: 1 },
    ]);
  });
});

describe('aiBulkRequests', () => {
  const base = { api, choice: 'failed' as const, collectionSlug: 'tasks', field: summary };

  it('sends chunks of 100', () => {
    const requests = aiBulkRequests({ ...base, drafts: false, targets: targets(250) });

    const sizes = requests.map(
      ({ url }) => Object.keys(query(url)).filter((key) => key.includes('[id][in]')).length,
    );

    expect(AI_BULK_CHUNK_SIZE).toBe(100);
    expect(sizes).toEqual([100, 100, 50]);
  });

  it('sends the IDs and the choice filter in each chunk', () => {
    const requests = aiBulkRequests({ ...base, drafts: false, targets: targets(101) });

    expect(path(requests[1]!.url)).toBe('/api/tasks');
    expect(query(requests[1]!.url)).toEqual({
      depth: '0',
      'where[and][0][id][in][0]': 'p100',
      [`where[and][1][${statusPath}][equals]`]: 'error',
    });
  });

  it('passes the locale through', () => {
    const requests = aiBulkRequests({ ...base, drafts: false, locale: 'fr', targets: targets(1) });

    expect(query(requests[0]!.url)).toMatchObject({ locale: 'fr' });
  });

  it('sends no draft state without drafts', () => {
    const requests = aiBulkRequests({ ...base, drafts: false, targets: targets(2) });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toEqual({ [statusPath]: 'pending' });
    expect(query(requests[0]!.url)).not.toHaveProperty('draft');
    expect(Object.keys(query(requests[0]!.url)).some((key) => key.includes('[_status]'))).toBe(
      false,
    );
  });

  it('sends draft rows first, then published rows, on draft collections', () => {
    const requests = aiBulkRequests({
      ...base,
      drafts: true,
      targets: [...targets(1), ...targets(1, true)],
    });

    expect(requests).toEqual([
      { body: { [statusPath]: 'pending' }, url: expect.any(String) },
      { body: { _status: 'published', [statusPath]: 'pending' }, url: expect.any(String) },
    ]);

    expect(query(requests[0]!.url)).toMatchObject({
      draft: 'true',
      'where[and][0][id][in][0]': 'd0',
      'where[and][2][_status][equals]': 'draft',
    });

    expect(query(requests[1]!.url)).toMatchObject({
      draft: 'true',
      'where[and][0][id][in][0]': 'p0',
      'where[and][2][_status][equals]': 'published',
    });
  });

  it('chunks each draft group on its own', () => {
    const requests = aiBulkRequests({
      ...base,
      drafts: true,
      targets: [...targets(101), ...targets(1, true)],
    });

    const groups = requests.map(({ url }) => query(url)['where[and][2][_status][equals]']);

    expect(groups).toEqual(['draft', 'published', 'published']);
  });

  it('sends nothing without targets', () => {
    expect(aiBulkRequests({ ...base, drafts: true, targets: [] })).toEqual([]);
  });
});

describe('aiBulkResultMessage', () => {
  it.each([
    [
      { loaded: 1, queued: 1 },
      { message: 'Queued 1 run', type: 'success' },
    ],
    [
      { loaded: 3, queued: 3 },
      { message: 'Queued 3 runs', type: 'success' },
    ],
    [
      { loaded: 2, queued: 1 },
      { message: `Queued 1 run · 1 record ${skipped}`, type: 'success' },
    ],
    [
      { loaded: 5, queued: 3 },
      { message: `Queued 3 runs · 2 records ${skipped}`, type: 'success' },
    ],
    [
      { loaded: 1, queued: 0 },
      { message: `Queued 0 runs · 1 record ${skipped}`, type: 'info' },
    ],
    [
      { loaded: 4, queued: 0 },
      { message: `Queued 0 runs · 4 records ${skipped}`, type: 'info' },
    ],
    [
      { loaded: 0, queued: 0 },
      { message: 'Queued 0 runs · no records matched', type: 'info' },
    ],
  ])('reports %j', (args, result) => {
    expect(aiBulkResultMessage(args)).toEqual(result);
  });

  it.each([
    [{ message: 'Forbidden' }, 0, 'Forbidden'],
    [{}, 0, "Couldn't queue the runs."],
    [{ message: '' }, 1, "Couldn't queue the runs. · 1 run already queued"],
    [{ message: 'Forbidden' }, 100, 'Forbidden · 100 runs already queued'],
  ])('reports a stop with %j after %i runs', (error, queued, message) => {
    expect(aiBulkResultMessage({ error, loaded: 250, queued })).toEqual({ message, type: 'error' });
  });
});

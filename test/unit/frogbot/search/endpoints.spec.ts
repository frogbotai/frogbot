import { describe, expect, it } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogbotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { buildSearchEndpoints } from '../../../../packages/frogbot/src/search/endpoints.js';
import { SearchValidationError } from '../../../../packages/frogbot/src/search/errors.js';
import { searchOperation } from '../../../../packages/frogbot/src/search/operation.js';
import type { SearchOptions } from '../../../../packages/frogbot/src/search/types.js';
import { ranking, searchFixture } from './fixture.js';

function restFixture(body: () => Promise<unknown>) {
  const fixture = searchFixture();

  Object.assign(fixture.frogbot, {
    search: (options: SearchOptions) => searchOperation(fixture.frogbot, fixture.payload, options),
  });

  fixture.req.json = body;

  const [endpoint] = buildSearchEndpoints({ collection: 'articles' });

  return { ...fixture, endpoint };
}

describe('collection search REST endpoint', () => {
  it('POST /api/articles/search ranks within the requesting user access and returns hits', async () => {
    const { endpoint, find, req, search } = restFixture(async () => ({
      index: 'content',
      query: { text: 'hello' },
      limit: 5,
      select: { title: true },
    }));

    const response = await endpoint.handler(req);

    expect(endpoint).toMatchObject({ method: 'post', path: '/search' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'lexical',
      ranking,
      hits: [{ doc: { id: 1, title: 'stored' }, score: 0.5 }],
    });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, mode: 'lexical' }));
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, select: { title: true } }),
    );
  });

  it.each(['overrideAccess', 'collection', 'req'])(
    'POST /api/articles/search rejects a body that sets %s',
    async (key) => {
      const { endpoint, req, search } = restFixture(async () => ({
        index: 'content',
        query: { text: 'hello' },
        [key]: true,
      }));

      await expect(endpoint.handler(req)).rejects.toMatchObject({
        name: 'SearchValidationError',
        status: 400,
      });

      expect(search).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', () => Promise.reject(new SyntaxError('Unexpected token'))],
    ['an array', async () => []],
    ['a string', async () => 'hello'],
  ])('POST /api/articles/search rejects %s as a 400 validation error', async (_label, body) => {
    const { endpoint, req } = restFixture(body);

    await expect(endpoint.handler(req)).rejects.toBeInstanceOf(SearchValidationError);
  });

  it('POST /api/articles/search surfaces invalid query input with its API status', async () => {
    const { endpoint, req } = restFixture(async () => ({ index: 'content', query: {} }));

    await expect(endpoint.handler(req)).rejects.toMatchObject({ status: 400 });
  });

  it('registers the endpoint only on collections with search indexes', async () => {
    const config: FrogbotConfig = {
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as FrogbotConfig['db'],
      collections: [
        {
          slug: 'articles',
          fields: [{ name: 'title', type: 'text' }],
          search: { titles: { lexical: { fields: ['title'] } } },
        },
        { slug: 'notes', fields: [{ name: 'title', type: 'text' }] },
      ],
    };

    const runtime = await sanitize(config)._internal.payloadConfig;

    const searchEndpoints = (slug: string) =>
      (runtime.collections.find((collection) => collection.slug === slug)?.endpoints || []).filter(
        ({ method, path }) => method === 'post' && path === '/search',
      );

    expect(searchEndpoints('articles')).toHaveLength(1);
    expect(searchEndpoints('notes')).toEqual([]);
  });
});

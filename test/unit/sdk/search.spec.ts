import { describe, expect, it } from 'vitest';

import { FrogBotSDKError } from '../../../packages/sdk/src/index';
import { baseURL, createClients } from './clients';

const result = {
  hits: [{ doc: { id: 1, title: 'Frogs' }, score: 0.9 }],
  mode: 'lexical',
  ranking: { approximate: false, higherIsBetter: true, method: 'bm25' },
};

const manyResult = {
  results: [
    { collection: 'search-articles', ...result },
    {
      collection: 'search-faqs',
      hits: [{ doc: { id: 2, question: 'Do frogs sleep?' }, score: 0.4 }],
      mode: 'lexical',
      ranking: { approximate: false, higherIsBetter: true, method: 'bm25' },
    },
  ],
};

const searchError = () =>
  Response.json(
    { errors: [{ message: "Search does not support the 'x' option." }] },
    { status: 400 },
  );

describe('FrogBotSDK search', () => {
  it('posts the search options as JSON to the collection search endpoint', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.search({
      candidates: 50,
      collection: 'search-articles',
      depth: 0,
      draft: false,
      fallbackLocale: false,
      index: 'content',
      limit: 5,
      locale: 'en',
      query: { text: 'frogs' },
      select: { title: true },
      where: { status: { equals: 'published' } },
    });

    expect(frogbotRequests).toEqual([
      {
        body: {
          candidates: 50,
          depth: 0,
          draft: false,
          fallbackLocale: false,
          index: 'content',
          limit: 5,
          locale: 'en',
          query: { text: 'frogs' },
          select: { title: true },
          where: { status: { equals: 'published' } },
        },
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        url: `${baseURL}/search-articles/search`,
      },
    ]);
  });

  it('returns the mode, ranking, and hits', async () => {
    const { frogbot } = createClients(() => Response.json(result));

    const response = await frogbot.search({
      collection: 'search-articles',
      index: 'content',
      query: { text: 'frogs' },
    });

    expect(response).toEqual(result);
  });

  it('never sends options the endpoint does not accept', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.search({
      collection: 'search-articles',
      index: 'content',
      overrideAccess: true,
      query: { text: 'frogs' },
      req: { user: { id: 1 } },
    } as never);

    expect(frogbotRequests[0]?.url).toBe(`${baseURL}/search-articles/search`);
    expect(frogbotRequests[0]?.body).toEqual({ index: 'content', query: { text: 'frogs' } });
  });

  it('leaves undefined options out of the body', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.search({
      collection: 'search-articles',
      index: 'content',
      limit: undefined,
      query: { vector: [0.1, 0.2] },
    });

    expect(frogbotRequests[0]?.body).toEqual({ index: 'content', query: { vector: [0.1, 0.2] } });
  });

  it('throws FrogBotSDKError with the server errors', async () => {
    const { frogbot } = createClients(searchError);

    const error = await frogbot
      .search({ collection: 'search-articles', index: 'content', query: { text: 'frogs' } })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error).toMatchObject({
      errors: [{ message: "Search does not support the 'x' option." }],
      status: 400,
    });
  });
});

describe('FrogBotSDK searchMany', () => {
  it('posts the collections and shared options as JSON to the FrogBot search endpoint', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(manyResult));

    await frogbot.searchMany({
      collections: [
        {
          candidates: 50,
          collection: 'search-articles',
          depth: 1,
          index: 'content',
          select: { title: true },
          where: { status: { equals: 'published' } },
        },
        { collection: 'search-faqs', index: 'answers' },
      ],
      draft: false,
      fallbackLocale: false,
      limit: 5,
      locale: 'en',
      query: { text: 'frogs' },
    });

    expect(frogbotRequests).toEqual([
      {
        body: {
          collections: [
            {
              candidates: 50,
              collection: 'search-articles',
              depth: 1,
              index: 'content',
              select: { title: true },
              where: { status: { equals: 'published' } },
            },
            { collection: 'search-faqs', index: 'answers' },
          ],
          draft: false,
          fallbackLocale: false,
          limit: 5,
          locale: 'en',
          query: { text: 'frogs' },
        },
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        url: `${baseURL}/frogbot/search`,
      },
    ]);
  });

  it('returns one result per collection in request order', async () => {
    const { frogbot } = createClients(() => Response.json(manyResult));

    const response = await frogbot.searchMany({
      collections: [
        { collection: 'search-articles', index: 'content' },
        { collection: 'search-faqs', index: 'answers' },
      ],
      query: { text: 'frogs' },
    });

    expect(response).toEqual(manyResult);
  });

  it('never sends shared options the endpoint does not accept', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(manyResult));

    await frogbot.searchMany({
      collection: 'search-articles',
      collections: [{ collection: 'search-articles', index: 'content' }],
      overrideAccess: true,
      query: { text: 'frogs' },
      req: { user: { id: 1 } },
    } as never);

    expect(frogbotRequests[0]?.body).toEqual({
      collections: [{ collection: 'search-articles', index: 'content' }],
      query: { text: 'frogs' },
    });
  });

  it('sends collection entries unchanged so the server checks their options', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(manyResult));

    await frogbot.searchMany({
      collections: [{ collection: 'search-articles', index: 'content', query: { text: 'toads' } }],
      query: { text: 'frogs' },
    } as never);

    expect(frogbotRequests[0]?.body).toEqual({
      collections: [{ collection: 'search-articles', index: 'content', query: { text: 'toads' } }],
      query: { text: 'frogs' },
    });
  });

  it('leaves undefined shared options out of the body', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(manyResult));

    await frogbot.searchMany({
      collections: [{ collection: 'search-articles', index: 'content' }],
      limit: undefined,
      query: { vector: [0.1, 0.2] },
    });

    expect(frogbotRequests[0]?.body).toEqual({
      collections: [{ collection: 'search-articles', index: 'content' }],
      query: { vector: [0.1, 0.2] },
    });
  });

  it('passes the request init to fetch', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(manyResult));

    await frogbot.searchMany(
      {
        collections: [{ collection: 'search-articles', index: 'content' }],
        query: { text: 'frogs' },
      },
      { headers: { Authorization: 'JWT token' } },
    );

    expect(frogbotRequests[0]?.headers).toEqual({
      authorization: 'JWT token',
      'content-type': 'application/json',
    });
  });

  it('throws FrogBotSDKError with the server errors', async () => {
    const { frogbot } = createClients(searchError);

    const error = await frogbot
      .searchMany({
        collections: [{ collection: 'search-articles', index: 'content' }],
        query: { text: 'frogs' },
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error).toMatchObject({
      errors: [{ message: "Search does not support the 'x' option." }],
      status: 400,
    });
  });
});

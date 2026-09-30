import { describe, expect, it } from 'vitest';

import { FrogBotSDKError } from '../../../packages/sdk/src/index';
import { baseURL, createClients } from './clients';

const result = {
  hits: [{ doc: { id: 1, title: 'Frogs' }, score: 0.9 }],
  mode: 'lexical',
  ranking: { approximate: false, higherIsBetter: true, method: 'bm25' },
};

describe('FrogBotSDK search', () => {
  it('posts the search options as JSON to the collection search endpoint', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.search('search-articles', {
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

    const response = await frogbot.search('search-articles', {
      index: 'content',
      query: { text: 'frogs' },
    });

    expect(response).toEqual(result);
  });

  it('never sends options the endpoint does not accept', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.search('search-articles', {
      collection: 'other',
      index: 'content',
      overrideAccess: true,
      query: { text: 'frogs' },
      req: { user: { id: 1 } },
    } as never);

    expect(frogbotRequests[0]?.body).toEqual({ index: 'content', query: { text: 'frogs' } });
  });

  it('leaves undefined options out of the body', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.search('search-articles', {
      index: 'content',
      limit: undefined,
      query: { vector: [0.1, 0.2] },
    });

    expect(frogbotRequests[0]?.body).toEqual({ index: 'content', query: { vector: [0.1, 0.2] } });
  });

  it('throws FrogBotSDKError with the server errors', async () => {
    const { frogbot } = createClients(() =>
      Response.json(
        { errors: [{ message: "Search does not support the 'x' option." }] },
        { status: 400 },
      ),
    );

    const error = await frogbot
      .search('search-articles', { index: 'content', query: { text: 'frogs' } })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error).toMatchObject({
      errors: [{ message: "Search does not support the 'x' option." }],
      status: 400,
    });
  });
});

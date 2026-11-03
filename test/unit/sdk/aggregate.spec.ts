import { describe, expect, expectTypeOf, it } from 'vitest';

import { FrogBotSDKError } from '../../../packages/sdk/src/index';
import { baseURL, createClients } from './clients';

const result = {
  groups: [{ group: { stage: 'won' }, values: { deals: 2, total: 900 } }],
  totalDocs: 1,
  totalPages: 1,
  page: 1,
  limit: 0,
  hasNextPage: false,
  hasPrevPage: false,
  nextPage: null,
  prevPage: null,
  pagingCounter: 1,
};

describe('FrogBotSDK aggregate', () => {
  it('posts the aggregate options as JSON to the collection aggregate endpoint', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.aggregate({
      collection: 'deals',
      depth: 1,
      disableErrors: true,
      draft: true,
      fallbackLocale: false,
      groupBy: ['stage', { field: 'closedAt', by: 'month' }],
      limit: 10,
      locale: 'en',
      page: 2,
      populate: { users: { name: true } },
      sort: '-total',
      trash: true,
      values: { deals: { count: true }, total: { sum: 'amount' } },
      where: { amount: { greater_than: 0 } },
    });

    expect(frogbotRequests).toEqual([
      {
        body: {
          depth: 1,
          disableErrors: true,
          draft: true,
          fallbackLocale: false,
          groupBy: ['stage', { field: 'closedAt', by: 'month' }],
          limit: 10,
          locale: 'en',
          page: 2,
          populate: { users: { name: true } },
          sort: '-total',
          trash: true,
          values: { deals: { count: true }, total: { sum: 'amount' } },
          where: { amount: { greater_than: 0 } },
        },
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        url: `${baseURL}/deals/aggregate`,
      },
    ]);
  });

  it('returns the groups and paging keys, typed by value name', async () => {
    const { frogbot } = createClients(() => Response.json(result));

    const response = await frogbot.aggregate({
      collection: 'deals',
      groupBy: 'stage',
      values: { deals: { count: true }, average: { avg: 'amount' } },
    });

    expect(response).toEqual(result);

    expectTypeOf(response.groups[0].values).toEqualTypeOf<{
      deals: number;
      average: number | null;
    }>();
  });

  it('never sends options the endpoint does not accept, and leaves undefined ones out', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    const options = {
      collection: 'deals',
      context: { a: 1 },
      groupBy: 'stage',
      limit: undefined,
      overrideAccess: true,
      req: { user: { id: 1 } },
      values: { deals: { count: true } },
    } as const;

    await frogbot.aggregate(options);

    expect(frogbotRequests[0]?.url).toBe(`${baseURL}/deals/aggregate`);
    expect(frogbotRequests[0]?.body).toEqual({
      groupBy: 'stage',
      values: { deals: { count: true } },
    });
  });

  it('passes init through to fetch', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(result));

    await frogbot.aggregate(
      { collection: 'deals', groupBy: 'stage', values: { deals: { count: true } } },
      { headers: { 'x-frogbot-test': 'yes' } },
    );

    expect(frogbotRequests[0]?.headers).toMatchObject({ 'x-frogbot-test': 'yes' });
  });

  it('throws FrogBotSDKError with the server errors', async () => {
    const { frogbot } = createClients(() =>
      Response.json(
        { errors: [{ message: "Aggregate does not support the 'x' option." }] },
        { status: 400 },
      ),
    );

    const error = await frogbot
      .aggregate({ collection: 'deals', groupBy: 'stage', values: { deals: { count: true } } })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error).toMatchObject({
      errors: [{ message: "Aggregate does not support the 'x' option." }],
      status: 400,
    });
  });
});

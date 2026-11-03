import { describe, expect, it } from 'vitest';

import { buildAggregateEndpoints } from '../../../../packages/frogbot/src/aggregate/endpoints.js';
import { AggregateValidationError } from '../../../../packages/frogbot/src/aggregate/errors.js';
import { aggregateOperation } from '../../../../packages/frogbot/src/aggregate/operation.js';
import type { AggregateOptions } from '../../../../packages/frogbot/src/aggregate/types.js';
import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { aggregateFixture } from './fixture.js';

function restFixture(body: unknown, options: Parameters<typeof aggregateFixture>[0] = {}) {
  const fixture = aggregateFixture(options);

  Object.assign(fixture.frogbot, {
    aggregate: (options: AggregateOptions) =>
      aggregateOperation(fixture.frogbot, fixture.payload, options),
  });

  fixture.req.json = () => Promise.resolve(body);

  const [endpoint] = buildAggregateEndpoints({ collection: 'deals' });

  return { ...fixture, endpoint };
}

const body = { groupBy: 'stage', values: { deals: { count: true } } };

describe('collection aggregate REST endpoint', () => {
  it('POST /api/deals/aggregate totals as the signed-in user', async () => {
    const { adapterAggregate, endpoint, req } = restFixture(
      { ...body, limit: 5 },
      { result: { rows: [{ group: ['won'], values: [2] }], totalDocs: 1 } },
    );

    const response = await endpoint.handler(req);

    expect(endpoint).toMatchObject({ method: 'post', path: '/aggregate' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      groups: [{ group: { stage: 'won' }, values: { deals: 2 } }],
      totalDocs: 1,
      limit: 5,
    });
    expect(adapterAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'deals', limit: 5, req: expect.anything() }),
    );
  });

  it('POST /api/deals/aggregate gives the 403 the collection read access gives', async () => {
    const { adapterAggregate, endpoint, req } = restFixture(body, { read: () => false });

    await expect(endpoint.handler(req)).rejects.toMatchObject({ status: 403 });
    expect(adapterAggregate).not.toHaveBeenCalled();
  });

  it.each(['collection', 'overrideAccess', 'req', 'context', 'select'])(
    'POST /api/deals/aggregate rejects a body that sets %s',
    async (key) => {
      const { adapterAggregate, endpoint, req } = restFixture({ ...body, [key]: true });

      await expect(endpoint.handler(req)).rejects.toMatchObject({
        name: 'AggregateValidationError',
        status: 400,
        message: `Aggregate does not support the '${key}' option.`,
      });

      expect(adapterAggregate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', () => Promise.reject(new SyntaxError('Unexpected token'))],
    ['an array', []],
    ['a string', 'hello'],
  ])('POST /api/deals/aggregate rejects %s as a 400 validation error', async (_label, input) => {
    const { endpoint, req } = restFixture(input);

    await expect(endpoint.handler(req)).rejects.toBeInstanceOf(AggregateValidationError);
  });

  it('POST /api/deals/aggregate surfaces invalid options with their API status', async () => {
    const { endpoint, req } = restFixture({ ...body, groupBy: 'missing' });

    await expect(endpoint.handler(req)).rejects.toMatchObject({ status: 400 });
  });

  it('registers the endpoint on every collection, after its own endpoints', async () => {
    const handler = () => new Response('ok');

    const config: FrogBotConfig = {
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as FrogBotConfig['db'],
      collections: [
        { slug: 'deals', fields: [{ name: 'title', type: 'text' }] },
        {
          slug: 'notes',
          fields: [{ name: 'title', type: 'text' }],
          endpoints: [{ path: '/stats', method: 'get', handler }],
        },
      ],
    };

    const runtime = await sanitize(config)._internal.payloadConfig;

    const routes = (slug: string) =>
      (runtime.collections.find((collection) => collection.slug === slug)?.endpoints || []).map(
        ({ method, path }) => `${method} ${path}`,
      );

    expect(routes('deals').slice(0, 1)).toEqual(['post /aggregate']);
    expect(routes('notes').slice(0, 2)).toEqual(['get /stats', 'post /aggregate']);
  });
});

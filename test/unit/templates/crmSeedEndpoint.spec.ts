import { describe, expect, it } from 'vitest';

import { seedEndpoint } from '../../../templates/crm/src/seed/endpoint.js';

describe('crm seed endpoint', () => {
  it('runs the seed once when two requests arrive while the record count is still loading', async () => {
    let runs = 0;
    let openCounts = () => undefined as void;
    const counting = new Promise<void>((resolve) => (openCounts = resolve));

    const frogbot = {
      count: async () => {
        await counting;

        return { totalDocs: runs };
      },
      logger: { error: () => undefined },
    };

    const endpoint = seedEndpoint(() => {
      runs++;

      return Promise.resolve({} as never);
    });

    const req = { user: { id: 1 }, frogbot } as never;
    const pending = [0, 1].map(() => Promise.resolve(endpoint.handler(req)));

    openCounts();

    const responses = await Promise.all(pending);

    expect(runs).toBe(1);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });
});

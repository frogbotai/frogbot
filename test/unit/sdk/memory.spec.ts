import { describe, expect, it } from 'vitest';

import { FrogBotSDKError } from '../../../packages/sdk/src/index';
import { baseURL, createClients } from './clients';

const memory = {
  id: '1',
  scope: 'me',
  text: 'Ann drinks green tea',
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const json = { 'content-type': 'application/json' };

describe('FrogBotSDK memory', () => {
  it('posts save with only the options given', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(memory));

    await frogbot.memory.save({ scope: 'me', text: 'Ann drinks green tea', key: 'drink' });

    await frogbot.memory.save({
      scope: 'agent',
      agent: 'support',
      text: 'Refunds need a ticket',
      pinned: true,
    });

    expect(frogbotRequests).toEqual([
      {
        body: { scope: 'me', text: 'Ann drinks green tea', key: 'drink' },
        headers: json,
        method: 'POST',
        url: `${baseURL}/frogbot/memory`,
      },
      {
        body: { scope: 'agent', agent: 'support', text: 'Refunds need a ticket', pinned: true },
        headers: json,
        method: 'POST',
        url: `${baseURL}/frogbot/memory`,
      },
    ]);
  });

  it('sends search, list and get as query strings', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json([]));

    await frogbot.memory.search({ scope: 'me', query: 'green tea', limit: 5 });
    await frogbot.memory.list({ scope: 'team', pinned: true, limit: 20, page: 2 });
    await frogbot.memory.get({ scope: 'agent', agent: 'support', id: 'a/b' });

    expect(frogbotRequests).toEqual([
      {
        body: undefined,
        headers: {},
        method: 'GET',
        url: `${baseURL}/frogbot/memory/search?scope=me&query=green+tea&limit=5`,
      },
      {
        body: undefined,
        headers: {},
        method: 'GET',
        url: `${baseURL}/frogbot/memory?scope=team&pinned=true&limit=20&page=2`,
      },
      {
        body: undefined,
        headers: {},
        method: 'GET',
        url: `${baseURL}/frogbot/memory/a%2Fb?scope=agent&agent=support`,
      },
    ]);
  });

  it('patches update and keeps a null key, which removes it', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json(memory));

    await frogbot.memory.update({ scope: 'me', id: 7, key: null, pinned: true });

    expect(frogbotRequests).toEqual([
      {
        body: { scope: 'me', key: null, pinned: true },
        headers: json,
        method: 'PATCH',
        url: `${baseURL}/frogbot/memory/7`,
      },
    ]);
  });

  it('deletes one memory by id, or the whole scope without one', async () => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json({ deleted: 1 }));

    await frogbot.memory.forget({ scope: 'me', id: 7 });
    await frogbot.memory.forget({ scope: 'team' });

    expect(frogbotRequests).toEqual([
      {
        body: undefined,
        headers: {},
        method: 'DELETE',
        url: `${baseURL}/frogbot/memory/7?scope=me`,
      },
      {
        body: undefined,
        headers: {},
        method: 'DELETE',
        url: `${baseURL}/frogbot/memory?scope=team`,
      },
    ]);
  });

  it('returns the response body and throws FrogBotSDKError on an error status', async () => {
    const { frogbot } = createClients(() => Response.json(memory));

    expect(await frogbot.memory.get({ scope: 'me', id: '1' })).toEqual(memory);

    const { frogbot: failing } = createClients(() =>
      Response.json(
        { errors: [{ message: "Scope 'me' already holds 3 memories." }] },
        { status: 409 },
      ),
    );

    const error = await failing.memory
      .save({ scope: 'me', text: 'Fourth' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error).toMatchObject({ status: 409, message: "Scope 'me' already holds 3 memories." });
  });
});

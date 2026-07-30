import { describe, expect, it, vi } from 'vitest';

import { config } from './config.js';

describe('API keys plugin integration', () => {
  it('composes through the public plugin contract and authenticates requests', async () => {
    let transformed = config;
    for (const plugin of config.plugins ?? []) transformed = await plugin(transformed);

    const credentials = transformed.collections.find((collection) => collection.slug === 'credentials')!;
    const fields = credentials.fields.map((field) => ('name' in field ? field.name : null));
    expect(fields).toEqual(expect.arrayContaining(['tokenHash', 'environment', 'tenant']));

    const accounts = transformed.collections.find((collection) => collection.slug === 'accounts')!;
    const strategy = typeof accounts.auth === 'object' ? accounts.auth.strategies?.[0] : undefined;
    const payload = {
      find: vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', owner: 'account-1' }] }),
      findByID: vi.fn().mockResolvedValue({ id: 'account-1' }),
      update: vi.fn().mockResolvedValue({}),
    };
    const mint = credentials.endpoints!.find((endpoint) => endpoint.path === '/mint')!;
    const create = vi.fn().mockResolvedValue({ id: 'key-1' });
    const response = await mint.handler({
      user: { id: 'account-1' },
      json: () => Promise.resolve({ name: 'Integration' }),
      frogbot: { create },
    } as never);
    const { token } = (await response.json()) as { token: string };
    const auth = await strategy?.authenticate({
      headers: new Headers({ 'x-service-key': token }),
      payload: payload as never,
    });

    expect(auth?.user).toMatchObject({ id: 'account-1', collection: 'accounts', _strategy: 'api-key' });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('token');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createApiKeyToken } from '../../../packages/plugins/plugin-api-keys/src/server/token.js';
import { createApiKeyStrategy } from '../../../packages/plugins/plugin-api-keys/src/strategy.js';

function makeStrategy() {
  return createApiKeyStrategy({
    authCollection: 'users',
    collectionSlug: 'api-keys',
    tokenPrefix: 'fb',
  });
}

function makeFrogBot() {
  return {
    find: vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1' }] }),
    findByID: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
    update: vi.fn().mockResolvedValue({}),
  };
}

describe('API key authentication strategy', () => {
  it('authenticates an active key as its owner', async () => {
    const frogbot = makeFrogBot();
    const token = createApiKeyToken();

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${token}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      collection: 'users',
      _strategy: 'api-key',
      apiKeyId: 'key-1',
    });
    expect(frogbot.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'api-keys', id: 'key-1' }),
    );
  });

  it('merges optional capture policy onto the request actor', async () => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({
      docs: [{ id: 'key-1', owner: 'user-1', capture: 'enabled', captureSampleRate: 0.25 }],
    });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toEqual(
      expect.objectContaining({ capture: 'enabled', captureSampleRate: 0.25 }),
    );
  });

  it.each([
    ['missing', new Headers()],
    ['malformed', new Headers({ authorization: 'Bearer invalid' })],
  ])('does not authenticate %s tokens', async (_name, headers) => {
    const frogbot = makeFrogBot();

    const result = await makeStrategy().authenticate({ headers, frogbot: frogbot as never });

    expect(result).toEqual({
      user: null,
    });
    expect(frogbot.find).not.toHaveBeenCalled();
  });

  it('does not authenticate unknown or revoked keys', async () => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [] });
    const token = createApiKeyToken();

    expect(
      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': token }),
        frogbot: frogbot as never,
      }),
    ).toEqual({ user: null });
    expect(frogbot.findByID).not.toHaveBeenCalled();
  });

  it('does not authenticate a deleted owner', async () => {
    const frogbot = makeFrogBot();
    frogbot.findByID.mockRejectedValue(new Error('Not found'));
    const token = createApiKeyToken();

    expect(
      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': token }),
        frogbot: frogbot as never,
      }),
    ).toEqual({ user: null });
    expect(frogbot.update).not.toHaveBeenCalled();
  });

  it.each([
    ['missing key ID', { owner: 'user-1' }],
    ['invalid key ID', { id: {}, owner: 'user-1' }],
    ['missing owner', { id: 'key-1' }],
    ['populated owner', { id: 'key-1', owner: { id: 'user-1' } }],
  ])('does not authenticate a key with %s', async (_name, key) => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [key] });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result).toEqual({ user: null });
    expect(frogbot.findByID).not.toHaveBeenCalled();
    expect(frogbot.update).not.toHaveBeenCalled();
  });

  it('authenticates numeric key and owner IDs including zero', async () => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [{ id: 0, owner: 0 }] });
    frogbot.findByID.mockResolvedValue({ id: 0, email: 'test@example.com' });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({ id: 0, apiKeyId: 0 });
    expect(frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 0 }),
    );
    expect(frogbot.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'api-keys', id: 0 }),
    );
  });
});

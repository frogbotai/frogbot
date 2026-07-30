import { describe, expect, it, vi } from 'vitest';

import { createApiKeyToken } from './server/token.js';
import { createApiKeyStrategy } from './strategy.js';

function makeStrategy() {
  return createApiKeyStrategy({
    authCollection: 'users',
    collectionSlug: 'api-keys',
    tokenPrefix: 'fbt',
  });
}

function makePayload() {
  return {
    find: vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1' }] }),
    findByID: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
    update: vi.fn().mockResolvedValue({}),
  };
}

describe('API key authentication strategy', () => {
  it('authenticates an active key as its owner', async () => {
    const payload = makePayload();
    const token = createApiKeyToken();
    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${token}` }),
      payload: payload as never,
    });

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      collection: 'users',
      _strategy: 'api-key',
      apiKeyId: 'key-1',
    });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'api-keys', id: 'key-1' }),
    );
  });

  it.each([
    ['missing', new Headers()],
    ['malformed', new Headers({ authorization: 'Bearer invalid' })],
  ])('does not authenticate %s tokens', async (_name, headers) => {
    const payload = makePayload();
    expect(await makeStrategy().authenticate({ headers, payload: payload as never })).toEqual({ user: null });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it('does not authenticate unknown or revoked keys', async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({ docs: [] });
    const token = createApiKeyToken();
    expect(
      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': token }),
        payload: payload as never,
      }),
    ).toEqual({ user: null });
    expect(payload.findByID).not.toHaveBeenCalled();
  });

  it('does not authenticate a deleted owner', async () => {
    const payload = makePayload();
    payload.findByID.mockRejectedValue(new Error('Not found'));
    const token = createApiKeyToken();
    expect(
      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': token }),
        payload: payload as never,
      }),
    ).toEqual({ user: null });
    expect(payload.update).not.toHaveBeenCalled();
  });
});

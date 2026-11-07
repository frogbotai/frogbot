import type { FrogBotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import {
  ApiKeyServiceError,
  mintApiKey,
  revokeApiKey,
  rotateApiKey,
} from '../../../packages/plugins/plugin-api-keys/src/index.js';

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', roles: ['member'] },
    frogbot: {},
    ...overrides,
  } as unknown as FrogBotRequest;
}

describe('API key services', () => {
  it('mints without an HTTP request body or response wrapper', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key-1', createdAt: 'now' });
    const req = request({ frogbot: { create } });

    const result = await mintApiKey({
      req,
      collectionSlug: 'credentials',
      tokenPrefix: 'fb',
      name: 'Deploy',
    });

    expect(result).toMatchObject({
      id: 'key-1',
      name: 'Deploy',
      token: expect.stringMatching(/^fb_/),
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'credentials',
        data: expect.objectContaining({
          owner: 'user-1',
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        overrideAccess: true,
      }),
    );
  });

  it('rejects unauthenticated minting even with a forged owner', async () => {
    const create = vi.fn();
    const req = request({ user: null, frogbot: { create } });
    const options = {
      req,
      collectionSlug: 'credentials',
      tokenPrefix: 'fb',
      name: 'Deploy',
      owner: 'victim-1',
    };

    await expect(mintApiKey(options as Parameters<typeof mintApiKey>[0])).rejects.toEqual(
      new ApiKeyServiceError('authentication_required'),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses to mint or rotate for an API-key request', async () => {
    const create = vi.fn();
    const find = vi.fn();
    const update = vi.fn();
    const req = request({
      user: { id: 'user-1', _strategy: 'api-key', apiKeyId: 'key-1' },
      frogbot: { create, find, update },
    });

    await expect(
      mintApiKey({ req, collectionSlug: 'credentials', tokenPrefix: 'fb', name: 'Persist' }),
    ).rejects.toEqual(new ApiKeyServiceError('session_required'));
    await expect(
      rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' }),
    ).rejects.toEqual(new ApiKeyServiceError('session_required'));
    expect(create).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('ignores forged owner input and stamps the authenticated user', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key-1' });
    const req = request({ frogbot: { create } });
    const options = {
      req,
      collectionSlug: 'credentials',
      tokenPrefix: 'fb',
      name: 'Deploy',
      owner: 'victim-1',
    };

    await mintApiKey(options);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ owner: 'user-1' }) }),
    );
  });

  it('revokes an owned scalar-owner key at depth zero, then the keys it minted', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });

    const update = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ docs: [{ id: 'key-2' }] })
      .mockResolvedValueOnce({ docs: [] });

    const req = request({ frogbot: { find, update } });

    await expect(
      revokeApiKey({ req, collectionSlug: 'credentials', id: 'key-1' }),
    ).resolves.toMatchObject({
      id: 'key-1',
      name: 'Deploy',
      owner: 'user-1',
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        depth: 0,
        where: { and: [{ id: { equals: 'key-1' } }, { owner: { equals: 'user-1' } }] },
      }),
    );
    expect(update.mock.calls.map(([args]) => args.id ?? args.where)).toEqual([
      'key-1',
      { and: [{ mintedBy: { in: ['key-1'] } }, { revokedAt: { exists: false } }] },
      { and: [{ mintedBy: { in: ['key-2'] } }, { revokedAt: { exists: false } }] },
    ]);
  });

  it('drops owner scoping only when anyOwner is set', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });

    const req = request({
      user: { id: 'support-1', roles: ['support'] },
      frogbot: { find, update: vi.fn().mockResolvedValue({ docs: [] }) },
    });

    await revokeApiKey({ req, collectionSlug: 'credentials', id: 'key-1', anyOwner: true });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { equals: 'key-1' } } }),
    );
  });

  it('rotates by minting, moving the minted keys, then revoking, keeping name, owner and mintedBy', async () => {
    const operations: string[] = [];
    const find = vi.fn().mockResolvedValue({
      docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1', mintedBy: 'key-0' }],
    });

    const update = vi.fn().mockImplementation((args: { id?: string }) => {
      operations.push(args.id ? 'revoke' : 'move');

      return Promise.resolve({ docs: [] });
    });

    const create = vi.fn().mockImplementation(() => {
      operations.push('mint');

      return Promise.resolve({ id: 'key-2' });
    });

    const req = request({ frogbot: { find, update, create } });

    const result = await rotateApiKey({
      req,
      collectionSlug: 'credentials',
      id: 'key-1',
      tokenPrefix: 'fb',
    });

    expect(operations).toEqual(['mint', 'move', 'revoke']);
    expect(result.id).toBe('key-2');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Deploy', owner: 'user-1', mintedBy: 'key-0' }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mintedBy: { equals: 'key-1' } },
        data: { mintedBy: 'key-2' },
      }),
    );
  });

  it('leaves the old key alone when the rotated mint fails', async () => {
    const update = vi.fn();
    const req = request({
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update,
        create: vi.fn().mockRejectedValue(new Error('invalid')),
      },
    });

    await expect(
      rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' }),
    ).rejects.toThrow('invalid');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'key-1', owner: { id: 'user-1' }, name: 'Deploy' },
    { id: 'key-1', owner: 'user-1' },
  ])('does not revoke before rotate inputs are valid', async (key) => {
    const update = vi.fn();
    const create = vi.fn();
    const req = request({
      frogbot: { find: vi.fn().mockResolvedValue({ docs: [key] }), update, create },
    });

    await expect(
      rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' }),
    ).rejects.toEqual(new ApiKeyServiceError('not_found'));
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

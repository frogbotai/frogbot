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
      .mockResolvedValueOnce({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'key-2', revokedAt: null }] })
      .mockResolvedValueOnce({ docs: [] });

    const update = vi.fn().mockResolvedValue({});

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
    expect(find.mock.calls.slice(1).map(([args]) => [args.where, args.pagination])).toEqual([
      [{ mintedBy: { in: ['key-1'] } }, false],
      [{ mintedBy: { in: ['key-2'] } }, false],
    ]);
    expect(update.mock.calls.map(([args]) => args.id ?? args.where)).toEqual([
      'key-1',
      { id: { in: ['key-2'] } },
    ]);
  });

  it('revokes only the key when cascade is false', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });

    const update = vi.fn().mockResolvedValue({});
    const req = request({ frogbot: { find, update } });

    await revokeApiKey({ req, collectionSlug: 'credentials', id: 'key-1', cascade: false });

    expect(find).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'key-1' }));
  });

  it('walks through an already revoked key to revoke the live keys under it', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'key-2', revokedAt: '2026-11-01T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'key-3', revokedAt: null }, { id: 'key-1' }] })
      .mockResolvedValueOnce({ docs: [] });

    const update = vi.fn().mockResolvedValue({});
    const req = request({ frogbot: { find, update } });

    await revokeApiKey({ req, collectionSlug: 'credentials', id: 'key-1' });

    expect(find.mock.calls.slice(1).map(([args]) => args.where)).toEqual([
      { mintedBy: { in: ['key-1'] } },
      { mintedBy: { in: ['key-2'] } },
      { mintedBy: { in: ['key-3'] } },
    ]);
    expect(update.mock.calls.map(([args]) => args.id ?? args.where)).toEqual([
      'key-1',
      { id: { in: ['key-3'] } },
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

  describe('expiry', () => {
    const day = 864e5;
    const inDays = (days: number) => new Date(Date.now() + days * day).toISOString();

    function minter(apiKey?: Record<string, unknown>) {
      const create = vi.fn().mockResolvedValue({ id: 'key-2', createdAt: 'now' });
      const req = request({
        user: apiKey
          ? {
              id: 'user-1',
              _strategy: 'api-key',
              apiKeyId: 'key-1',
              apiKey: { id: 'key-1', canMint: true, ...apiKey },
            }
          : { id: 'user-1' },
        frogbot: { create },
      });

      return { create, req };
    }

    it('stores and returns expiresAt, and null when none is asked', async () => {
      const expiresAt = inDays(90);
      const { create, req } = minter();

      const dated = await mintApiKey({
        req,
        collectionSlug: 'credentials',
        tokenPrefix: 'fb',
        name: 'CI',
        expiresAt,
      });

      const undated = await mintApiKey({
        req,
        collectionSlug: 'credentials',
        tokenPrefix: 'fb',
        name: 'CI',
      });

      expect(dated.expiresAt).toBe(expiresAt);
      expect(undated.expiresAt).toBeNull();
      expect(create.mock.calls.map(([args]) => args.data.expiresAt)).toEqual([expiresAt, null]);
    });

    it('ignores expiresAt passed in data from other plugins', async () => {
      const { create, req } = minter();

      await mintApiKey({
        req,
        collectionSlug: 'credentials',
        tokenPrefix: 'fb',
        name: 'CI',
        data: { expiresAt: inDays(5) },
      });

      expect(create.mock.calls[0][0].data.expiresAt).toBeNull();
    });

    it.each([
      ['an unreadable date', 'soon', 'expiresAt must be a date, such as 2027-01-31T00:00:00.000Z.'],
      ['a past date', '2020-01-01T00:00:00.000Z', 'expiresAt must be in the future.'],
      [
        'a year past 9999',
        '+020271-01-02T00:00:00.000Z',
        'expiresAt must be before the year 10000.',
      ],
    ])('refuses %s with a 400', async (_name, expiresAt, message) => {
      const { create, req } = minter();

      await expect(
        mintApiKey({
          req,
          collectionSlug: 'credentials',
          tokenPrefix: 'fb',
          name: 'CI',
          expiresAt,
        }),
      ).rejects.toMatchObject({ message, status: 400 });
      expect(create).not.toHaveBeenCalled();
    });

    it('caps a key minted by a key at its parent date', async () => {
      const parent = inDays(30);
      const earlier = inDays(10);
      const { create, req } = minter({ expiresAt: parent });
      const mint = (expiresAt?: string | null) =>
        mintApiKey({
          req,
          collectionSlug: 'credentials',
          tokenPrefix: 'fb',
          name: 'Child',
          expiresAt,
        });

      expect((await mint(inDays(90))).expiresAt).toBe(parent);
      expect((await mint()).expiresAt).toBe(parent);
      expect((await mint(null)).expiresAt).toBe(parent);
      expect((await mint(earlier)).expiresAt).toBe(earlier);
      expect(create.mock.calls.map(([args]) => args.data.expiresAt)).toEqual([
        parent,
        parent,
        parent,
        earlier,
      ]);
    });

    it('caps nothing when the parent key never expires', async () => {
      const asked = inDays(90);
      const { req } = minter({ expiresAt: null });

      await expect(
        mintApiKey({
          req,
          collectionSlug: 'credentials',
          tokenPrefix: 'fb',
          name: 'Child',
          expiresAt: asked,
        }),
      ).resolves.toMatchObject({ expiresAt: asked });
      await expect(
        mintApiKey({ req, collectionSlug: 'credentials', tokenPrefix: 'fb', name: 'Child' }),
      ).resolves.toMatchObject({ expiresAt: null });
    });

    it("rotates a key keeping its expiresAt, even past the rotating key's own date", async () => {
      const expiresAt = inDays(60);
      const create = vi.fn().mockResolvedValue({ id: 'key-2' });
      const req = request({
        frogbot: {
          find: vi.fn().mockResolvedValue({
            docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1', expiresAt }],
          }),
          update: vi.fn().mockResolvedValue({ docs: [] }),
          create,
        },
      });

      const result = await rotateApiKey({
        req,
        collectionSlug: 'credentials',
        id: 'key-1',
        tokenPrefix: 'fb',
      });

      expect(result.expiresAt).toBe(expiresAt);
      expect(create.mock.calls[0][0].data.expiresAt).toBe(expiresAt);
    });

    it('rotates a key with no expiresAt into one with none', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'key-2' });
      const req = request({
        frogbot: {
          find: vi
            .fn()
            .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
          update: vi.fn().mockResolvedValue({ docs: [] }),
          create,
        },
      });

      await rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' });

      expect(create.mock.calls[0][0].data.expiresAt).toBeNull();
    });

    it('refuses to rotate an expired key with a 400, minting and revoking nothing', async () => {
      const create = vi.fn();
      const update = vi.fn();
      const req = request({
        frogbot: {
          find: vi.fn().mockResolvedValue({
            docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1', expiresAt: inDays(-1) }],
          }),
          update,
          create,
        },
      });

      await expect(
        rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' }),
      ).rejects.toMatchObject({
        message: 'This key has expired. Mint a new key instead.',
        status: 400,
      });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});

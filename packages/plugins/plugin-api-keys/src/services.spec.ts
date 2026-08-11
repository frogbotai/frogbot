import type { FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeyServiceError, mintApiKey, revokeApiKey, rotateApiKey } from './index.js';

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', roles: ['member'] },
    frogbot: {},
    ...overrides,
  } as unknown as FrogbotRequest;
}

describe('API key services', () => {
  it('mints without an HTTP request body or response wrapper', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key-1', createdAt: 'now' });
    const req = request({ frogbot: { create } });

    const result = await mintApiKey({ req, collectionSlug: 'credentials', tokenPrefix: 'fb', name: 'Deploy' });

    expect(result).toMatchObject({ id: 'key-1', name: 'Deploy', token: expect.stringMatching(/^fb_/) });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'credentials',
      data: expect.objectContaining({ owner: 'user-1', tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      overrideAccess: true,
    }));
  });

  it('rejects unauthenticated minting even with a forged owner', async () => {
    const create = vi.fn();
    const req = request({ user: null, frogbot: { create } });
    const options = { req, collectionSlug: 'credentials', tokenPrefix: 'fb', name: 'Deploy', owner: 'victim-1' };

    await expect(mintApiKey(options as Parameters<typeof mintApiKey>[0])).rejects.toEqual(new ApiKeyServiceError('authentication_required'));
    expect(create).not.toHaveBeenCalled();
  });

  it('ignores forged owner input and stamps the authenticated user', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key-1' });
    const req = request({ frogbot: { create } });
    const options = { req, collectionSlug: 'credentials', tokenPrefix: 'fb', name: 'Deploy', owner: 'victim-1' };

    await mintApiKey(options as Parameters<typeof mintApiKey>[0]);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ owner: 'user-1' }) }));
  });

  it('revokes an owned scalar-owner key at depth zero', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });
    const update = vi.fn().mockResolvedValue({});
    const req = request({ frogbot: { find, update } });

    await expect(revokeApiKey({ req, collectionSlug: 'credentials', id: 'key-1' })).resolves.toMatchObject({
      id: 'key-1',
      name: 'Deploy',
      owner: 'user-1',
    });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ depth: 0, where: { and: [{ id: { equals: 'key-1' } }, { owner: { equals: 'user-1' } }] } }));
    expect(update).toHaveBeenCalledOnce();
  });

  it('drops owner scoping only when anyOwner is set', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });
    const req = request({ user: { id: 'support-1', roles: ['support'] }, frogbot: { find, update: vi.fn() } });

    await revokeApiKey({ req, collectionSlug: 'credentials', id: 'key-1', anyOwner: true });

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { equals: 'key-1' } } }));
  });

  it('rotates through revoke then mint while preserving name and owner', async () => {
    const operations: string[] = [];
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });
    const update = vi.fn().mockImplementation(async () => { operations.push('revoke'); });
    const create = vi.fn().mockImplementation(async () => { operations.push('mint'); return { id: 'key-2' }; });
    const req = request({ frogbot: { find, update, create } });

    const result = await rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' });

    expect(operations).toEqual(['revoke', 'mint']);
    expect(result.id).toBe('key-2');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'Deploy', owner: 'user-1' }) }));
  });

  it.each([
    { id: 'key-1', owner: { id: 'user-1' }, name: 'Deploy' },
    { id: 'key-1', owner: 'user-1' },
  ])('does not revoke before rotate inputs are valid', async (key) => {
    const update = vi.fn();
    const create = vi.fn();
    const req = request({ frogbot: { find: vi.fn().mockResolvedValue({ docs: [key] }), update, create } });

    await expect(rotateApiKey({ req, collectionSlug: 'credentials', id: 'key-1', tokenPrefix: 'fb' })).rejects.toEqual(new ApiKeyServiceError('not_found'));
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

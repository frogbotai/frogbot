import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { allow, hasRole, isLoggedIn, ownRows, rolesOf, rolesPlugin, viaApiKey } from './index.js';

function config(): FrogbotConfig {
  return {
    secret: 'test',
    db: {} as never,
    collections: [
      { slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] },
      {
        slug: 'posts',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'owner', type: 'relationship', relationTo: 'users' },
          { name: 'reviewer', type: 'relationship', relationTo: 'users', hasMany: true },
        ],
      },
    ],
  };
}

function req(roles: string[] = ['member'], id = 'user-1'): FrogbotRequest {
  return { user: { id, roles } } as unknown as FrogbotRequest;
}

describe('rolesPlugin', () => {
  it('is inert without configured roles', async () => {
    const input = config();
    expect(await rolesPlugin()(input)).toMatchObject({ _roles: { present: true, configured: false } });
    expect(await rolesPlugin({ roles: [] })(input)).toMatchObject({ _roles: { present: true, configured: false } });
  });

  it('clears prior role prewiring when roles are empty', async () => {
    const read = () => true as const;
    const input = { ...config(), _roles: { required: true as const, present: true as const, configured: true, threads: { read }, messages: { read }, usageLogs: { read } } };
    const result = await rolesPlugin()(input);
    expect(result._roles).toEqual({ required: true, present: true, configured: false });
  });

  it('writes bound access for core surfaces', async () => {
    const result = await rolesPlugin({ roles: ['admin', 'member', 'finance', 'auditor', 'support'] })(config());
    const memberReq = { user: { id: 'user-1', roles: ['member'] } } as FrogbotRequest;
    const financeReq = { user: { id: 'user-2', roles: ['finance'] } } as FrogbotRequest;
    expect(await result._roles?.threads?.read?.({ req: memberReq })).toEqual({ user: { equals: 'user-1' } });
    expect(await result._roles?.messages?.read?.({ req: memberReq })).toEqual({ 'thread.user': { equals: 'user-1' } });
    expect(await result._roles?.usageLogs?.read?.({ req: memberReq })).toEqual({ user: { equals: 'user-1' } });
    expect(await result._roles?.usageLogs?.read?.({ req: financeReq })).toBe(true);
  });

  it('injects a labeled role select and assigns admin to the first user', async () => {
    const result = await rolesPlugin({ roles: ['admin', 'prompt-engineer', { slug: 'finance', label: 'Money' }] })(config());
    const users = result.collections.find(({ slug }) => slug === 'users')!;
    expect(users.fields).toContainEqual(expect.objectContaining({
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Prompt Engineer', value: 'prompt-engineer' },
        { label: 'Money', value: 'finance' },
      ],
    }));
    const hook = users.hooks!.beforeChange!.at(-1)!;
    const hookReq = { frogbot: { count: vi.fn().mockResolvedValue({ totalDocs: 0 }) } } as unknown as FrogbotRequest;
    await expect(hook({ operation: 'create', data: { name: 'First' }, req: hookReq } as never)).resolves.toEqual({
      name: 'First',
      roles: ['admin'],
    });
  });

  it('rejects duplicate role slugs and auth field collisions', () => {
    expect(() => rolesPlugin({ roles: ['member', 'member'] })).toThrow(/Duplicate role slug 'member'/);
    expect(() => rolesPlugin({ roles: ['Admin'] })).toThrow(/Reserved role slug 'Admin' must be lowercase/);
    const input = config();
    input.collections[0]!.fields.push({ name: 'roles', type: 'text' });
    expect(() => rolesPlugin({ roles: ['member'] })(input)).toThrow(/roles/);
  });
});

describe('predicates and resolution', () => {
  it('exposes literal synchronous predicates', async () => {
    const request = req(['admin', 'member']);
    await rolesPlugin({ roles: ['admin', 'member'] })(config());
    expect(isLoggedIn(request)).toBe(true);
    expect(rolesOf(request)).toEqual(['admin', 'member']);
    expect(hasRole(request, 'member')).toBe(true);
    expect(hasRole(request, 'finance')).toBe(false);
    expect(ownRows(request, 'id')).toEqual({ id: { equals: 'user-1' } });
    expect(ownRows(request, 'owner')).toEqual({ owner: { equals: 'user-1' } });
    expect(viaApiKey({ user: { id: 'user-1', _strategy: 'api-key' } } as unknown as FrogbotRequest)).toBe(true);
  });

  it('memoizes a custom resolver once per request', async () => {
    const resolveRoles = vi.fn(() => ['finance']);
    const result = await rolesPlugin({ roles: ['finance'], resolveRoles })(config());
    const frogbot = { find: vi.fn().mockResolvedValue({ docs: [], hasNextPage: false }), logger: { warn: vi.fn() } };
    await result.onInit!(frogbot as never);
    const request = { ...req([]), frogbot } as unknown as FrogbotRequest;
    expect(hasRole(request, 'finance')).toBe(true);
    expect(rolesOf(request)).toEqual(['finance']);
    expect(resolveRoles).toHaveBeenCalledTimes(1);
  });

  it('checks stored assignments across every user page', async () => {
    const result = await rolesPlugin({ roles: ['member'] })(config());
    const find = vi.fn()
      .mockResolvedValueOnce({ docs: [{ roles: ['retired'] }], hasNextPage: true, nextPage: 2 })
      .mockResolvedValueOnce({ docs: [{ roles: ['former'] }], hasNextPage: false, nextPage: null });
    const warn = vi.fn();
    await result.onInit!({ find, logger: { warn } } as never);
    expect(find).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1 }));
    expect(find).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retired, former'));
  });
});

describe('allow', () => {
  it('uses the specified evaluation order and abstaining function clauses', async () => {
    const access = allow('finance', { role: 'member', own: 'owner' }, () => false, () => ({ reviewer: { equals: 'user-1' } }));
    const input = config();
    input.collections[1]!.access = { read: access };
    const result = await rolesPlugin({ roles: ['member', 'finance'] })(input);
    const bound = result.collections[1]!.access!.read!;

    await expect(bound({ req: req(['finance']) })).resolves.toBe(true);
    await expect(bound({ req: req(['member']) })).resolves.toEqual({
      or: [{ owner: { equals: 'user-1' } }, { reviewer: { equals: 'user-1' } }],
    });
    await expect(bound({ req: { user: null } as FrogbotRequest })).resolves.toBe(false);
  });

  it('applies admin implicitly only when admin is configured', async () => {
    const configured = allow('finance');
    const configuredInput = config();
    configuredInput.collections[1]!.access = { read: configured };
    const configuredResult = await rolesPlugin({ roles: ['admin', 'finance'] })(configuredInput);
    await expect(configuredResult.collections[1]!.access!.read!({ req: req(['admin']) })).resolves.toBe(true);

    const literal = allow('finance');
    const literalInput = config();
    literalInput.collections[1]!.access = { read: literal };
    const literalResult = await rolesPlugin({ roles: ['finance'] })(literalInput);
    await expect(literalResult.collections[1]!.access!.read!({ req: req(['admin']) })).resolves.toBe(false);
  });

  it('validates own clauses and stamps create ownership', async () => {
    const create = allow({ role: 'member', own: 'owner' });
    const input = config();
    input.collections[1]!.access = { create };
    const result = await rolesPlugin({ roles: ['member'] })(input);
    const posts = result.collections.find(({ slug }) => slug === 'posts')!;
    const hook = posts.hooks!.beforeChange!.at(-1)!;
    expect(await hook({ operation: 'create', data: { owner: 'spoofed' }, req: req() } as never)).toEqual({ owner: 'user-1' });
    expect(await posts.access!.create!({ req: req() })).toBe(true);
    expect(await hook({ operation: 'create', data: {}, req: req(['admin']) } as never)).toEqual({});

    const invalid = config();
    invalid.collections[1]!.access = { read: allow({ role: 'member', own: 'oner' }) };
    expect(() => rolesPlugin({ roles: ['member'] })(invalid)).toThrow(/owner/);
  });

  it('does not stamp ownership for admin or function-only create grants', async () => {
    const input = config();
    input.collections[1]!.access = { create: allow({ role: 'member', own: 'owner' }, ({ req }) => hasRole(req, 'finance')) };
    const result = await rolesPlugin({ roles: ['admin', 'member', 'finance'] })(input);
    const posts = result.collections[1]!;
    const hook = posts.hooks!.beforeChange!.at(-1)!;
    expect(await posts.access!.create!({ req: req(['admin']) })).toBe(true);
    expect(await hook({ operation: 'create', data: {}, req: req(['admin']) } as never)).toEqual({});
    expect(await posts.access!.create!({ req: req(['finance']) })).toBe(true);
    expect(await hook({ operation: 'create', data: {}, req: req(['finance']) } as never)).toEqual({});
  });

  it('uses polymorphic values only for polymorphic ownership fields', async () => {
    const input = config();
    input.collections[1]!.fields.push({ name: 'subject', type: 'relationship', relationTo: ['users', 'teams'] });
    input.collections[1]!.access = { read: allow({ role: 'member', own: 'subject' }) };
    const result = await rolesPlugin({ roles: ['member'] })(input);
    const request = { user: { id: 'user-1', roles: ['member'], collection: 'users' } } as unknown as FrogbotRequest;
    expect(await result.collections[1]!.access!.read!({ req: request })).toEqual({
      subject: { equals: { relationTo: 'users', value: 'user-1' } },
    });
  });

  it('rejects app-authored unlisted role slugs at boot', () => {
    const input = config();
    input.collections[1]!.access = { read: allow('finance') };
    expect(() => rolesPlugin({ roles: ['member'] })(input)).toThrow(/finance/);
  });

  it("allows own 'id' only on the auth collection", () => {
    const invalid = config();
    invalid.collections[1]!.access = { read: allow({ role: 'member', own: 'id' }) };
    expect(() => rolesPlugin({ roles: ['member'] })(invalid)).toThrow(/only valid on the 'users' auth collection/);

    const valid = config();
    valid.collections[0]!.access = { read: allow({ role: 'member', own: 'id' }) };
    expect(() => rolesPlugin({ roles: ['member'] })(valid)).not.toThrow();
  });

  it('keeps resolver bindings isolated when one compiler is reused', async () => {
    const shared = allow('finance');
    const first = config();
    first.collections[1]!.access = { read: shared };
    const second = config();
    second.collections[1]!.access = { read: shared };
    const firstResult = await rolesPlugin({ roles: ['finance'], resolveRoles: () => ['finance'] })(first);
    const secondResult = await rolesPlugin({ roles: ['finance'], resolveRoles: () => [] })(second);
    expect(await firstResult.collections[1]!.access!.read!({ req: req([]) })).toBe(true);
    expect(await secondResult.collections[1]!.access!.read!({ req: req([]) })).toBe(false);
  });
});

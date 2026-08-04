import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { can, canAgent, canField, rolesPlugin } from './index.js';

const roles = [
  {
    slug: 'admin',
    name: 'Administrator',
    grants: [{ resource: '*', actions: ['*'] }],
  },
  {
    slug: 'member',
    name: 'Member',
    grants: [
      { resource: 'usage-logs', actions: ['read'], scope: 'own' as const },
      { resource: 'agents/assistant', actions: ['run'] },
      { resource: 'budgets', actions: ['read'] },
    ],
  },
];

function config(): FrogbotConfig {
  return {
    secret: 'test',
    db: {} as never,
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }],
  };
}

function req(roleValues: unknown, id = 'user-1'): FrogbotRequest {
  return { user: { id, roles: roleValues } } as unknown as FrogbotRequest;
}

describe('role access adapters', () => {
  it('supports exact and wildcard grants', async () => {
    expect(await can('budgets:read')({ req: req([roles[1]]) })).toBe(true);
    expect(await can('budgets:update')({ req: req([roles[1]]) })).toBe(false);
    expect(await can('anything:delete')({ req: req([roles[0]]) })).toBe(true);
  });

  it('returns an owner query only from Payload access', async () => {
    expect(await can('usage-logs:read')({ req: req([roles[1]]) })).toEqual({
      user: { equals: 'user-1' },
    });
    expect(await can('usage-logs:read', { ownerField: 'createdBy' })({ req: req([roles[1]]) })).toEqual({
      createdBy: { equals: 'user-1' },
    });
    expect(await canAgent('usage-logs:read')({ req: req([roles[1]]) })).toBe(true);
  });

  it('supports field-level grants without returning queries', async () => {
    expect(await canField('budgets:read')({ req: req([roles[1]]) })).toBe(true);
    expect(await canField('budgets:manage')({ req: req([roles[1]]) })).toBe(false);
  });

  it('denies anonymous, unpopulated, and malformed role relationships', async () => {
    expect(await can('budgets:read')({ req: { user: null } as FrogbotRequest })).toBe(false);
    expect(await can('budgets:read')({ req: req(['member']) })).toBe(false);
    expect(await can('budgets:read')({ req: req([{ slug: 'member' }]) })).toBe(false);
    expect(await can('budgets:read')({ req: req(null) })).toBe(false);
  });
});

describe('rolesPlugin', () => {
  it('injects a read-only roles projection and editable auth relationship', async () => {
    const result = await rolesPlugin({ roles })(config());
    const roleCollection = result.collections.find((item) => item.slug === 'roles')!;
    const authCollection = result.collections.find((item) => item.slug === 'users')!;

    expect(roleCollection.access).toEqual(expect.objectContaining({
      create: expect.any(Function),
      delete: expect.any(Function),
      read: expect.any(Function),
      update: expect.any(Function),
    }));
    expect(await roleCollection.access!.read!({ req: req([roles[0]]) })).toBe(true);
    expect(await roleCollection.access!.create!({ req: req([roles[0]]) })).toBe(false);
    expect(authCollection.fields).toContainEqual(expect.objectContaining({
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
    }));
    expect(typeof authCollection.auth).toBe('object');
    expect((authCollection.auth as { depth?: number }).depth).toBe(1);
  });

  it('preserves auth config, higher depth, fields, hooks, and collection access', async () => {
    const beforeChange = vi.fn();
    const read = vi.fn(() => true);
    const input = config();
    input.collections[0] = {
      slug: 'users',
      auth: { depth: 3, tokenExpiration: 60 },
      fields: [{ name: 'name', type: 'text' }],
      hooks: { beforeChange: [beforeChange] },
      access: { read },
    };

    const result = await rolesPlugin({ roles })(input);
    const auth = result.collections.find((item) => item.slug === 'users')!;

    expect(auth.auth).toEqual(expect.objectContaining({ depth: 3, tokenExpiration: 60 }));
    expect(auth.fields[0]).toEqual({ name: 'name', type: 'text' });
    expect(auth.hooks!.beforeChange![0]).toBe(beforeChange);
    expect(auth.access!.read).toBe(read);
  });

  it('validates auth, role, resource, and field collisions', () => {
    expect(() => rolesPlugin({ roles })(config())).not.toThrow();
    expect(() => rolesPlugin({ roles, authCollection: 'accounts' })(config())).toThrow(/accounts/);
    expect(() => rolesPlugin({ roles: [...roles, roles[0]!] })(config())).toThrow(/admin/);
    expect(() => rolesPlugin({ roles: [{ slug: 'bad', name: 'Bad', grants: [{ resource: 'unknown', actions: ['read'] }] }], adminRole: 'bad', resources: [{ slug: 'known', actions: ['read'] }] })(config())).toThrow(/unknown/);
    const input = config();
    input.collections[0]!.fields.push({ name: 'roles', type: 'text' });
    expect(() => rolesPlugin({ roles })(input)).toThrow(/roles/);
  });

  it('synchronizes roles idempotently and composes existing onInit', async () => {
    const existingOnInit = vi.fn();
    const input = config() as FrogbotConfig & { onInit?: (frogbot: unknown) => Promise<void> };
    input.onInit = existingOnInit;
    const result = await rolesPlugin({ roles })(input);
    const find = vi.fn()
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 'role-admin', slug: 'admin' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'role-member', slug: 'member' }] });
    const create = vi.fn().mockResolvedValue({ id: 'role-admin' });
    const update = vi.fn().mockResolvedValue({ id: 'role-admin' });
    const frogbot = { find, create, update };

    await (result as typeof input).onInit!(frogbot);
    await (result as typeof input).onInit!(frogbot);

    expect(existingOnInit).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'roles',
      overrideAccess: true,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'roles',
      id: 'role-admin',
      overrideAccess: true,
    }));
  });

  it('assigns admin only to the first user without an explicit role', async () => {
    const result = await rolesPlugin({ roles })(config());
    const hook = result.collections.find((item) => item.slug === 'users')!.hooks!.beforeChange!.at(-1)!;
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'role-admin' }] });
    const count = vi.fn().mockResolvedValue({ totalDocs: 0 });
    const hookReq = { frogbot: { find, count } } as unknown as FrogbotRequest;

    await expect(hook({ operation: 'create', data: { name: 'First' }, req: hookReq } as never)).resolves.toEqual({
      name: 'First',
      roles: ['role-admin'],
    });
    await expect(hook({ operation: 'create', data: { roles: ['role-member'] }, req: hookReq } as never)).resolves.toEqual({
      roles: ['role-member'],
    });
    count.mockResolvedValue({ totalDocs: 1 });
    await expect(hook({ operation: 'create', data: { name: 'Later' }, req: hookReq } as never)).resolves.toEqual({
      name: 'Later',
    });
  });
});

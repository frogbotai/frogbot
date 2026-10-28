import type { FrogBotConfig, FrogBotRequest, Plugin } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { auditLogPlugin } from '../../../packages/plugins/plugin-audit-log/src/index.js';
import { capturePlugin } from '../../../packages/plugins/plugin-capture/src/index.js';
import type { CaptureStorage } from '../../../packages/plugins/plugin-capture/src/types.js';
import { compiledAccess } from '../../../packages/plugins/plugin-roles/src/allow.js';
import {
  allow,
  hasRole,
  isLoggedIn,
  ownRows,
  rolesOf,
  rolesPlugin,
  viaApiKey,
} from '../../../packages/plugins/plugin-roles/src/index.js';

function config(): FrogBotConfig {
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

function req(roles: string[] = ['member'], id = 'user-1'): FrogBotRequest {
  return { user: { id, roles } } as unknown as FrogBotRequest;
}

describe('rolesPlugin', () => {
  it('is inert without configured roles', async () => {
    const input = config();

    expect((await rolesPlugin()(input))._roles).toEqual({
      present: true,
      configured: false,
      roles: [],
    });
    expect((await rolesPlugin({ roles: [] })(input))._roles).toEqual({
      present: true,
      configured: false,
      roles: [],
    });
  });

  it('writes marker-only role metadata', async () => {
    const input = config();
    const configured = await rolesPlugin({ roles: ['admin', 'member'] })(input);

    expect(configured._roles).toEqual({
      present: true,
      configured: true,
      roles: ['admin', 'member'],
    });

    const result = await rolesPlugin()(input);

    expect(result._roles).toEqual({ present: true, configured: false, roles: [] });
  });

  it('injects a labeled role select without bootstrap hooks', async () => {
    const result = await rolesPlugin({
      roles: ['admin', 'prompt-engineer', { slug: 'finance', label: 'Money' }],
    })(config());

    const users = result.collections.find(({ slug }) => slug === 'users')!;

    expect(users.fields).toContainEqual(
      expect.objectContaining({
        name: 'roles',
        type: 'select',
        hasMany: true,
        options: [
          { label: 'Admin', value: 'admin' },
          { label: 'Prompt Engineer', value: 'prompt-engineer' },
          { label: 'Money', value: 'finance' },
        ],
      }),
    );
    expect(users.hooks?.beforeChange).toBeUndefined();
  });

  it('rejects duplicate role slugs and auth field collisions', () => {
    expect(() => rolesPlugin({ roles: ['member', 'member'] })).toThrow(
      /Duplicate role slug 'member'/,
    );
    expect(rolesPlugin({ roles: ['Admin'] })(config())).toMatchObject({
      _roles: { roles: ['Admin'] },
    });

    const input = config();
    input.collections[0].fields.push({ name: 'roles', type: 'text' });

    expect(() => rolesPlugin({ roles: ['member'] })(input)).toThrow(/roles/);
  });

  it('validates defaultRole configuration', () => {
    expect(() => rolesPlugin({ roles: ['admin'], defaultRole: 'member' })).toThrow(
      /defaultRole 'member' is not listed/,
    );
  });

  it('configures defaultRole as the injected field default value', async () => {
    const result = await rolesPlugin({ roles: ['admin', 'member'], defaultRole: 'member' })(
      config(),
    );

    const users = result.collections.find(({ slug }) => slug === 'users')!;

    expect(users.hooks?.beforeChange).toBeUndefined();
    expect(users.fields).toContainEqual(
      expect.objectContaining({ name: 'roles', defaultValue: ['member'] }),
    );
  });

  it('omits the field default value when no defaultRole is set', async () => {
    const result = await rolesPlugin({ roles: ['admin', 'member'] })(config());
    const field = result.collections[0].fields.find(
      (item) => 'name' in item && item.name === 'roles',
    )!;

    expect('defaultValue' in field).toBe(false);
  });

  it('leaves the role field on Payload default access', async () => {
    const result = await rolesPlugin({ roles: ['admin', 'member'] })(config());
    const field = result.collections[0].fields.find(
      (item) => 'name' in item && item.name === 'roles',
    )!;

    expect('access' in field).toBe(false);
  });

  it('passes custom rolesFieldAccess through unchanged', async () => {
    const update = vi.fn(() => true as const);
    const rolesFieldAccess = { update };
    const result = await rolesPlugin({ roles: ['member'], rolesFieldAccess })(config());
    const field = result.collections[0].fields.find(
      (item) => 'name' in item && item.name === 'roles',
    )!;

    expect('access' in field && field.access?.update).toBe(update);
  });
});

describe('plugin order', () => {
  async function built(plugins: Plugin[]): Promise<FrogBotConfig> {
    let seen: FrogBotConfig | undefined;
    const spy: Plugin = Object.assign(
      (input: FrogBotConfig) => {
        seen = input;

        return input;
      },
      { order: 1000 },
    );

    await buildConfig({
      secret: 'secret',
      db: {} as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ai: { providers: { openai: { apiKey: 'test' } } },
      plugins: [...plugins, spy],
    });

    return seen!;
  }

  function binding(result: FrogBotConfig, slug: string): unknown {
    const read = result.collections.find((collection) => collection.slug === slug)!.access!
      .read as unknown as Record<symbol, { binding?: unknown }>;

    return read[compiledAccess]?.binding;
  }

  it('binds allow() on collections from plugins listed after it', async () => {
    const result = await built([
      rolesPlugin({ roles: ['admin'] }),
      auditLogPlugin({ access: { read: allow('admin') } }),
      capturePlugin({ storage: {} as CaptureStorage, access: allow('admin') }),
    ]);

    expect(binding(result, 'ai-captures')).toBeDefined();
    expect(binding(result, 'audit-logs')).toBeDefined();
  });

  it('runs audit-log after plugins that add collections, wherever it is listed', async () => {
    const result = await built([
      auditLogPlugin(),
      capturePlugin({ storage: {} as CaptureStorage, access: allow('admin') }),
      rolesPlugin({ roles: ['admin'] }),
    ]);

    const captures = result.collections.find((collection) => collection.slug === 'ai-captures')!;

    expect(captures.hooks?.afterChange).toHaveLength(1);
    expect(captures.hooks?.afterDelete).toHaveLength(1);
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
    expect(
      viaApiKey({ user: { id: 'user-1', _strategy: 'api-key' } } as unknown as FrogBotRequest),
    ).toBe(true);
  });

  it('memoizes a custom resolver once per request', async () => {
    const resolveRoles = vi.fn(() => ['finance']);
    const result = await rolesPlugin({ roles: ['finance'], resolveRoles })(config());
    const frogbot = {
      find: vi.fn().mockResolvedValue({ docs: [], hasNextPage: false }),
      logger: { warn: vi.fn() },
    };

    for (const onInit of Array.isArray(result.onInit) ? result.onInit : [result.onInit!]) {
      await onInit(frogbot as never);
    }

    const request = { ...req([]), frogbot } as unknown as FrogBotRequest;

    expect(hasRole(request, 'finance')).toBe(true);
    expect(rolesOf(request)).toEqual(['finance']);
    expect(resolveRoles).toHaveBeenCalledTimes(1);
  });
});

describe('allow', () => {
  it('uses the specified evaluation order and abstaining function clauses', async () => {
    const access = allow(
      'finance',
      { role: 'member', own: 'owner' },
      () => false,
      () => ({ reviewer: { equals: 'user-1' } }),
    );

    const input = config();
    input.collections[1].access = { read: access };
    const result = await rolesPlugin({ roles: ['member', 'finance'] })(input);
    const bound = result.collections[1].access!.read!;

    await expect(bound({ slug: 'test', req: req(['finance']) })).resolves.toBe(true);
    await expect(bound({ slug: 'test', req: req(['member']) })).resolves.toEqual({
      or: [{ owner: { equals: 'user-1' } }, { reviewer: { equals: 'user-1' } }],
    });
    await expect(bound({ slug: 'test', req: { user: null } as FrogBotRequest })).resolves.toBe(
      false,
    );
  });

  it('grants only roles listed in each allow call', async () => {
    const input = config();
    input.collections[1].access = { read: allow('finance') };
    const result = await rolesPlugin({ roles: ['admin', 'finance'] })(input);

    await expect(
      result.collections[1].access!.read!({ slug: 'test', req: req(['admin']) }),
    ).resolves.toBe(false);
    await expect(
      result.collections[1].access!.read!({ slug: 'test', req: req(['finance']) }),
    ).resolves.toBe(true);
  });

  it('validates own clauses and stamps create ownership', async () => {
    const create = allow({ role: 'member', own: 'owner' });
    const input = config();
    input.collections[1].access = { create };
    const result = await rolesPlugin({ roles: ['member'] })(input);
    const posts = result.collections.find(({ slug }) => slug === 'posts')!;
    const hook = posts.hooks!.beforeChange!.at(-1)!;

    expect(
      await hook({ operation: 'create', data: { owner: 'spoofed' }, req: req() } as never),
    ).toEqual({ owner: 'user-1' });
    expect(await posts.access!.create!({ slug: 'test', req: req() })).toBe(true);
    expect(await posts.access!.create!({ slug: 'test', req: req(['admin']) })).toBe(false);

    const invalid = config();
    invalid.collections[1].access = { read: allow({ role: 'member', own: 'oner' }) };

    expect(() => rolesPlugin({ roles: ['member'] })(invalid)).toThrow(/owner/);
  });

  it('does not stamp ownership for function-only create grants', async () => {
    const input = config();

    input.collections[1].access = {
      create: allow({ role: 'member', own: 'owner' }, ({ req }) => hasRole(req, 'finance')),
    };

    const result = await rolesPlugin({ roles: ['member', 'finance'] })(input);
    const posts = result.collections[1];
    const hook = posts.hooks!.beforeChange!.at(-1)!;

    expect(await posts.access!.create!({ slug: 'test', req: req(['finance']) })).toBe(true);
    expect(await hook({ operation: 'create', data: {}, req: req(['finance']) } as never)).toEqual(
      {},
    );
  });

  it('uses polymorphic values only for polymorphic ownership fields', async () => {
    const input = config();

    input.collections[1].fields.push({
      name: 'subject',
      type: 'relationship',
      relationTo: ['users', 'teams'],
    });

    input.collections[1].access = { read: allow({ role: 'member', own: 'subject' }) };
    const result = await rolesPlugin({ roles: ['member'] })(input);
    const request = {
      user: { id: 'user-1', roles: ['member'], collection: 'users' },
    } as unknown as FrogBotRequest;

    expect(await result.collections[1].access!.read!({ slug: 'test', req: request })).toEqual({
      subject: { equals: { relationTo: 'users', value: 'user-1' } },
    });
  });

  it('rejects app-authored unlisted role slugs at boot', () => {
    const input = config();
    input.collections[1].access = { read: allow('finance') };

    expect(() => rolesPlugin({ roles: ['member'] })(input)).toThrow(/finance/);
  });

  it("allows own 'id' only on the auth collection", () => {
    const invalid = config();
    invalid.collections[1].access = { read: allow({ role: 'member', own: 'id' }) };

    expect(() => rolesPlugin({ roles: ['member'] })(invalid)).toThrow(
      /only valid on the 'users' auth collection/,
    );

    const valid = config();
    valid.collections[0].access = { read: allow({ role: 'member', own: 'id' }) };

    expect(() => rolesPlugin({ roles: ['member'] })(valid)).not.toThrow();
  });

  it('keeps resolver bindings isolated when one compiler is reused', async () => {
    const shared = allow('finance');
    const first = config();
    first.collections[1].access = { read: shared };
    const second = config();
    second.collections[1].access = { read: shared };
    const firstResult = await rolesPlugin({ roles: ['finance'], resolveRoles: () => ['finance'] })(
      first,
    );

    const secondResult = await rolesPlugin({ roles: ['finance'], resolveRoles: () => [] })(second);

    expect(await firstResult.collections[1].access!.read!({ slug: 'test', req: req([]) })).toBe(
      true,
    );
    expect(await secondResult.collections[1].access!.read!({ slug: 'test', req: req([]) })).toBe(
      false,
    );
  });
});

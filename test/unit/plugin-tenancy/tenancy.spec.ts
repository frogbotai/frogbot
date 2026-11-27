import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { describe, expect, it } from 'vitest';

import {
  personalTenantName,
  tenancyPlugin,
} from '../../../packages/plugins/plugin-tenancy/src/index.js';

const users: CollectionConfig = { slug: 'users', auth: true, fields: [] };
const notes: CollectionConfig = { slug: 'notes', fields: [] };

const run = async (
  collections: CollectionConfig[],
  options?: Parameters<typeof tenancyPlugin>[0],
) => (await tenancyPlugin(options)({ collections } as unknown as FrogBotConfig)).collections;

const names = (collection: CollectionConfig | undefined) =>
  collection?.fields.map((field) => ('name' in field ? field.name : ''));

describe('personalTenantName', () => {
  it('uses the first name, else the start of the email', () => {
    expect(personalTenantName({ name: 'Colby Gilbert' }, 'workspace')).toBe("Colby's workspace");
    expect(personalTenantName({ name: '  ', email: 'pat.lee@example.com' }, 'team')).toBe(
      "Pat's team",
    );
    expect(personalTenantName({ email: 'jo+dojo@example.com' }, 'team')).toBe("Jo's team");
    expect(personalTenantName({}, 'workspace')).toBe('My workspace');
  });
});

describe('tenancyPlugin', () => {
  it('adds tenants and members after the auth collection, with their defaults', async () => {
    const collections = await run([users, notes]);

    expect(collections.map(({ slug }) => slug)).toEqual(['users', 'tenants', 'members', 'notes']);
    expect(names(collections[1])).toEqual(['name', 'slug', 'members']);
    expect(names(collections[2])).toEqual(['tenant', 'email', 'user', 'role']);
    expect(collections[2].indexes).toEqual([{ fields: ['tenant', 'email'], unique: true }]);
    expect(collections[0].hooks?.afterLogin).toHaveLength(1);
  });

  it('takes the app’s slugs and merges its additions', async () => {
    const own = () => true;
    const audit = () => undefined;
    const collections = await run([users], {
      tenantsSlug: 'teams',
      membersSlug: 'teamMembers',
      tenantField: 'team',
      tenants: {
        admin: { group: 'Teams' },
        fields: [
          { name: 'motto', type: 'text' },
          { name: 'name', type: 'textarea' },
        ],
      },
      members: { access: { read: own }, hooks: { afterDelete: [audit] } },
    });

    const [, teams, members] = collections;

    expect(teams.admin).toEqual({ useAsTitle: 'name', icon: 'building', group: 'Teams' });
    expect(names(teams)).toEqual(['name', 'slug', 'motto', 'members']);
    expect(teams.fields[0]).toMatchObject({ type: 'textarea' });
    expect(teams.fields.at(-1)).toMatchObject({
      type: 'join',
      collection: 'teamMembers',
      on: 'team',
    });
    expect(members.access?.read).toBe(own);
    expect(members.hooks?.afterDelete?.at(-1)).toBe(audit);
    expect(members.hooks?.afterDelete).toHaveLength(2);
    expect(members.fields[0]).toMatchObject({
      name: 'team',
      relationTo: 'teams',
    });
  });

  it('refuses a missing auth collection and a slug already taken', async () => {
    await expect(run([notes])).rejects.toThrow("Auth collection 'users' must exist");
    await expect(run([users, { slug: 'members', fields: [] }])).rejects.toThrow(
      "Collection 'members' already exists",
    );
  });
});

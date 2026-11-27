import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adminsTenant,
  forgetTenants,
  handOverTenant,
  inTenants,
  myTenants,
  ownsTenant,
  roleAtLeast,
  tenantRole,
} from '@frogbotai/plugin-tenancy';
import type { CollectionSlug, FrogBotInstance, FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type BootedFrogBot, bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Doc = { id: number; [key: string]: unknown };

const teams = 'teams' as CollectionSlug;
const teamMembers = 'teamMembers' as CollectionSlug;
const notes = 'notes' as CollectionSlug;

describe('tenancyPlugin on teams', () => {
  let booted: BootedFrogBot;
  let frogbot: FrogBotInstance;
  const users: Record<string, Doc> = {};
  let acme: Doc;

  const password = 'tenancy-test-password';

  const as = (who: string) => frogbot.createRequest({ user: users[who] });

  const find = async (who: string, collection: CollectionSlug) =>
    (
      await frogbot.find({
        collection,
        depth: 0,
        overrideAccess: false,
        req: await as(who),
      })
    ).docs as unknown as Doc[];

  const rows = async (where: Record<string, unknown>) =>
    (
      await frogbot.find({
        collection: teamMembers,
        where: where as never,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as unknown as Doc[];

  const createTeam = async (who: string, name: string) =>
    (await frogbot.create({
      collection: teams,
      data: { name },
      overrideAccess: false,
      req: await as(who),
    })) as unknown as Doc;

  const invite = async (who: string, team: Doc, email: string, role?: string) =>
    (await frogbot.create({
      collection: teamMembers,
      data: { team: team.id, email, ...(role && { role }) },
      overrideAccess: false,
      req: await as(who),
    })) as unknown as Doc;

  const signUp = async (email: string, extra: Record<string, unknown> = {}) => {
    const user = (await frogbot.create({
      collection: 'users',
      data: { email, password, ...extra },
      overrideAccess: true,
    })) as unknown as Doc;

    users[email.split('@')[0]] = user;

    return user;
  };

  const signIn = (email: string) =>
    frogbot.login({ collection: 'users', data: { email, password } });

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-tenancy');
    frogbot = booted.frogbot;
    await clearAndSeed(frogbot, 'empty');

    for (const who of ['colby', 'alice', 'stranger', 'root']) {
      await signUp(`${who}@example.com`);
    }
  });

  afterAll(async () => {
    await booted?.shutdown();
  });

  it('makes the creator the owner, with a unique slug and the app’s fields and hooks', async () => {
    acme = await createTeam('colby', 'Acme Co');

    expect(acme).toMatchObject({ slug: 'acme-co', motto: 'Onward' });
    expect(await rows({ team: { equals: acme.id } })).toMatchObject([
      { email: 'colby@example.com', user: users.colby.id, role: 'owner' },
    ]);

    expect((await createTeam('alice', 'Acme Co')).slug).toBe('acme-co-2');
    expect((await createTeam('alice', '!!!')).slug).toBe('team');
  });

  it('shows a team only to its members and super users', async () => {
    expect((await find('colby', teams)).map(({ name }) => name)).toEqual(['Acme Co']);
    expect(await find('stranger', teams)).toEqual([]);
    expect(await find('stranger', teamMembers)).toEqual([]);
    expect(await find('root', teams)).toHaveLength(3);
  });

  it('lets only admins rename a team, and nobody delete one', async () => {
    await invite('colby', acme, 'alice@example.com');

    await expect(
      frogbot.update({
        collection: teams,
        id: acme.id,
        data: { name: 'Alice Co' },
        overrideAccess: false,
        req: await as('alice'),
      }),
    ).rejects.toThrow();

    await expect(
      frogbot.delete({
        collection: teams,
        id: acme.id,
        overrideAccess: false,
        req: await as('root'),
      }),
    ).rejects.toThrow();
  });

  it('links an invite to an existing account at Viewer, and refuses non-admins and duplicates', async () => {
    const [alice] = await rows({ email: { equals: 'alice@example.com' } });

    expect(alice).toMatchObject({
      team: acme.id,
      user: users.alice.id,
      role: 'viewer',
    });

    await expect(invite('alice', acme, 'eve@example.com')).rejects.toThrow();

    await frogbot.update({
      collection: teamMembers,
      id: alice.id,
      data: { role: 'editor' },
      overrideAccess: false,
      req: await as('colby'),
    });

    await expect(invite('alice', acme, 'eve@example.com')).rejects.toThrow();
    await expect(
      frogbot.update({
        collection: teamMembers,
        id: alice.id,
        data: { role: 'admin' },
        overrideAccess: false,
        req: await as('alice'),
      }),
    ).rejects.toThrow();
    await expect(invite('colby', acme, ' Alice@Example.com ')).rejects.toThrow();
  });

  it('keeps exactly one owner, one row or in bulk, and moves it only by a handover', async () => {
    const owners = async () =>
      (await rows({ team: { equals: acme.id }, role: { equals: 'owner' } })).map(
        ({ email }) => email,
      );

    const [owner] = await rows({
      team: { equals: acme.id },
      role: { equals: 'owner' },
    });

    const [alice] = await rows({ email: { equals: 'alice@example.com' } });
    const handOverFirst = 'The Owner stays in the team until they hand it over to another member.';

    await expect(
      frogbot.update({
        collection: teamMembers,
        id: owner.id,
        data: { role: 'editor' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(handOverFirst);
    await expect(
      frogbot.update({
        collection: teamMembers,
        where: { team: { equals: acme.id } },
        data: { role: 'viewer' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(handOverFirst);
    await expect(
      frogbot.delete({
        collection: teamMembers,
        id: owner.id,
        overrideAccess: false,
        req: await as('colby'),
      }),
    ).rejects.toThrow(handOverFirst);
    await expect(
      frogbot.delete({
        collection: teamMembers,
        where: { team: { equals: acme.id } },
        overrideAccess: true,
      }),
    ).rejects.toThrow(handOverFirst);

    for (const change of [
      async () =>
        frogbot.update({
          collection: teamMembers,
          id: alice.id,
          data: { role: 'owner' },
          overrideAccess: false,
          req: await as('colby'),
        }),
      () => invite('colby', acme, 'eve@example.com', 'owner'),
    ]) {
      await expect(change()).rejects.toThrow(
        'Nobody is made the Owner of a team by an invite or a role change.',
      );
    }

    await frogbot.update({
      collection: teamMembers,
      id: alice.id,
      data: { role: 'admin' },
      overrideAccess: false,
      req: await as('colby'),
    });

    for (const change of [
      async () =>
        frogbot.update({
          collection: teamMembers,
          id: owner.id,
          data: { role: 'viewer' },
          overrideAccess: false,
          req: await as('alice'),
        }),
      async () =>
        frogbot.delete({
          collection: teamMembers,
          id: owner.id,
          overrideAccess: false,
          req: await as('alice'),
        }),
    ]) {
      await expect(change()).rejects.toThrow(
        "Only the team's Owner can change or remove the Owner.",
      );
    }

    expect(await owners()).toEqual(['colby@example.com']);
    expect(await rows({ team: { equals: acme.id } })).toHaveLength(2);

    expect(
      await handOverTenant(await as('alice'), {
        tenant: acme.id,
        to: alice.id,
        by: 'owner',
      }),
    ).toMatchObject({ done: false, status: 403 });
    expect(
      await handOverTenant(await as('colby'), {
        tenant: acme.id,
        to: owner.id,
        by: 'owner',
      }),
    ).toMatchObject({ done: false, status: 400 });
    expect(
      await handOverTenant(await as('colby'), {
        tenant: acme.id,
        to: alice.id,
        by: 'owner',
      }),
    ).toEqual({ done: true, from: String(owner.id), to: String(alice.id) });
    expect(await owners()).toEqual(['alice@example.com']);
    expect(await tenantRole(await as('colby'), acme.id)).toBe('admin');

    expect(
      await handOverTenant(await as('root'), {
        tenant: acme.id,
        to: owner.id,
        by: 'superUser',
      }),
    ).toMatchObject({ done: true });
    expect(await owners()).toEqual(['colby@example.com']);
  });

  it("keeps one team's records away from another team's members", async () => {
    await signUp('client@example.com');
    const other = await createTeam('client', 'Other Co');
    const write = async (who: string, team: Doc, title: string) =>
      frogbot.create({
        collection: notes,
        data: { title, team: team.id },
        overrideAccess: false,
        req: await as(who),
      });

    await write('colby', acme, 'Acme plan');
    await write('client', other, 'Other plan');

    expect((await find('colby', notes)).map(({ title }) => title)).toEqual(['Acme plan']);
    expect((await find('client', notes)).map(({ title }) => title)).toEqual(['Other plan']);
    expect(await find('stranger', notes)).toEqual([]);
    expect(await find('alice', notes)).toHaveLength(1);
    await expect(write('client', acme, 'Sneaky')).rejects.toThrow();
  });

  it('lets a member leave, and an admin remove anyone', async () => {
    const invited = await invite('colby', acme, 'bob@example.com');

    await frogbot.delete({
      collection: teamMembers,
      id: invited.id,
      overrideAccess: false,
      req: await as('colby'),
    });

    const [alice] = await rows({ email: { equals: 'alice@example.com' } });

    await frogbot.delete({
      collection: teamMembers,
      id: alice.id,
      overrideAccess: false,
      req: await as('alice'),
    });

    expect(await rows({ team: { equals: acme.id } })).toHaveLength(1);
  });

  it('claims invites at sign-in, before making a personal team', async () => {
    await invite('colby', acme, 'pat@example.com');
    await signUp('pat@example.com', { name: 'Pat Lee' });
    await signIn('pat@example.com');

    expect(await rows({ email: { equals: 'pat@example.com' } })).toMatchObject([
      { team: acme.id, user: users.pat.id, role: 'viewer' },
    ]);
  });

  it('makes a personal team at a sign-in that finds none, unless skipped', async () => {
    await signUp('jo.ann@example.com');
    await signIn('jo.ann@example.com');
    await signIn('jo.ann@example.com');

    const names = (await find('jo.ann', teams)).map(({ name }) => name);

    expect(names).toEqual(["Jo's team"]);

    await signUp('robot@example.com', { robot: true });
    await signIn('robot@example.com');

    expect(await rows({ user: { equals: users.robot.id } })).toEqual([]);
  });

  it('exports helpers that read memberships once per request', async () => {
    const req: FrogBotRequest = await as('colby');
    const mine = await myTenants(req);

    expect(mine.all.map(String)).toEqual([String(acme.id)]);
    expect(mine.editable).toEqual(mine.all);
    expect(mine.admin).toEqual(mine.all);
    expect(mine.owner).toEqual(mine.all);
    expect(await ownsTenant(req, acme.id)).toBe(true);
    expect(await ownsTenant(await as('pat'), acme.id)).toBe(false);
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'owner')).toBe(false);
    expect(roleAtLeast(null, 'viewer')).toBe(false);
    expect(await adminsTenant(req, acme.id)).toBe(true);
    expect(await adminsTenant(req, { id: acme.id })).toBe(true);
    expect(await adminsTenant(await as('pat'), acme.id)).toBe(false);
    expect(await tenantRole(req, acme.id)).toBe('owner');
    expect(await tenantRole(await as('pat'), acme.id)).toBe('viewer');
    expect(await tenantRole(await as('stranger'), acme.id)).toBeNull();
    expect((await myTenants(await as('pat'))).editable).toEqual([]);
    expect(await inTenants('team')({ req })).toEqual({
      team: { in: mine.all },
    });
    expect(await inTenants('team', { role: 'admin' })({ req: await as('stranger') })).toEqual({
      team: { in: [] },
    });

    const dummy = await frogbot.createRequest();

    expect(await inTenants('team')({ req: dummy })).toBe(false);
    expect(await myTenants(dummy)).toEqual({
      all: [],
      editable: [],
      admin: [],
      owner: [],
    });

    expect(myTenants(req)).toBe(myTenants(req));

    forgetTenants(req);

    expect(await myTenants(req)).toEqual(mine);
  });
});

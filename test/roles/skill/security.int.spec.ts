import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { password, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('roles skill access policy', () => {
  let booted: BootedFrogBot;
  let memberReq: FrogBotRequest;
  let ownerReq: FrogBotRequest;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'roles-skill');
  });

  afterAll(async () => {
    await booted?.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const member = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'member@example.com', password, roles: ['member'] },
      overrideAccess: true,
    });
    const owner = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'owner@example.com', password, roles: ['owner'] },
      overrideAccess: true,
    });

    memberReq = await booted.frogbot.createRequest({ user: { ...member, collection: usersSlug } });
    ownerReq = await booted.frogbot.createRequest({ user: { ...owner, collection: usersSlug } });
  });

  it('ignores privileged roles supplied by a member when creating an account', async () => {
    const created = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'new-member@example.com', password, roles: ['owner', 'admin'] },
      req: memberReq,
      overrideAccess: false,
    });

    const persisted = await booted.frogbot.findByID({ collection: usersSlug, id: created.id });

    expect(persisted.roles).toEqual(['member']);
  });

  it('allows an owner to assign roles when creating an account', async () => {
    const created = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'new-owner@example.com', password, roles: ['owner'] },
      req: ownerReq,
      overrideAccess: false,
    });

    const persisted = await booted.frogbot.findByID({ collection: usersSlug, id: created.id });

    expect(persisted.roles).toEqual(['owner']);
  });

  it('ignores privileged roles supplied by a member when updating their account', async () => {
    await booted.frogbot.update({
      collection: usersSlug,
      id: memberReq.user!.id,
      data: { roles: ['owner'] },
      req: memberReq,
      overrideAccess: false,
    });

    const persisted = await booted.frogbot.findByID({
      collection: usersSlug,
      id: memberReq.user!.id,
    });

    expect(persisted.roles).toEqual(['member']);
  });

  it('allows an owner to update role assignments', async () => {
    await booted.frogbot.update({
      collection: usersSlug,
      id: memberReq.user!.id,
      data: { roles: ['admin'] },
      req: ownerReq,
      overrideAccess: false,
    });

    const persisted = await booted.frogbot.findByID({
      collection: usersSlug,
      id: memberReq.user!.id,
    });

    expect(persisted.roles).toEqual(['admin']);
  });
});

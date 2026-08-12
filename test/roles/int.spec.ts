import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot.js';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-test-password';

type User = {
  id: number | string;
  email: string;
  roles?: string[];
};

describe('roles', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  async function createUser(email: string, roles?: string[]): Promise<User> {
    return await booted.frogbot.create({
      collection: 'users',
      data: { email, password, ...(roles ? { roles } : {}) },
      overrideAccess: true,
    }) as User;
  }

  async function requestFor(user: User) {
    return booted.frogbot.createRequest({ user: { ...user, collection: 'users' } } as never);
  }

  it('does not assign a role to the first user without defaultRole', async () => {
    const user = await createUser('first@frogbot.local');
    const persisted = await booted.frogbot.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    }) as User;

    expect(persisted.roles ?? []).toEqual([]);
  });

  it('allows member-only collection access for members but not admins', async () => {
    const admin = await createUser('admin@frogbot.local', ['admin']);
    const member = await createUser('member@frogbot.local', ['member']);
    await booted.frogbot.create({
      collection: 'member-documents',
      data: { title: 'Members only' },
      overrideAccess: true,
    });

    await expect(booted.frogbot.find({
      collection: 'member-documents',
      req: await requestFor(admin),
      overrideAccess: false,
    })).rejects.toThrow();

    const result = await booted.frogbot.find({
      collection: 'member-documents',
      req: await requestFor(member),
      overrideAccess: false,
    });
    expect(result.docs).toHaveLength(1);
  });

  it('enforces custom roles field update access on persisted users', async () => {
    const owner = await createUser('role-owner@frogbot.local', ['owner']);
    const admin = await createUser('role-admin@frogbot.local', ['admin']);
    const target = await createUser('role-target@frogbot.local', ['member']);

    await booted.frogbot.update({
      collection: 'users',
      id: target.id,
      data: { roles: ['owner'] },
      req: await requestFor(owner),
      overrideAccess: false,
    });
    await booted.frogbot.update({
      collection: 'users',
      id: target.id,
      data: { roles: ['admin'] },
      req: await requestFor(admin),
      overrideAccess: false,
    });

    const persisted = await booted.frogbot.findByID({
      collection: 'users',
      id: target.id,
      overrideAccess: true,
    }) as User;
    expect(persisted.roles).toEqual(['owner']);
  });

  it('does not grant admins implicit access to another user chat data', async () => {
    const owner = await createUser('chat-owner@frogbot.local', ['owner']);
    const admin = await createUser('chat-admin@frogbot.local', ['admin']);
    const thread = await booted.frogbot.create({
      collection: 'threads',
      data: { title: 'Private', user: owner.id },
      overrideAccess: true,
    });
    await booted.frogbot.create({
      collection: 'messages',
      data: { id: 'private-message', thread: thread.id, role: 'user', parts: [{ type: 'text', text: 'Private' }] },
      overrideAccess: true,
    });

    const adminReq = await requestFor(admin);
    const ownerReq = await requestFor(owner);
    const adminThreads = await booted.frogbot.find({ collection: 'threads', req: adminReq, overrideAccess: false });
    const adminMessages = await booted.frogbot.find({ collection: 'messages', req: adminReq, overrideAccess: false });
    const ownerThreads = await booted.frogbot.find({ collection: 'threads', req: ownerReq, overrideAccess: false });
    const ownerMessages = await booted.frogbot.find({ collection: 'messages', req: ownerReq, overrideAccess: false });

    expect(adminThreads.docs).toHaveLength(0);
    expect(adminMessages.docs).toHaveLength(0);
    expect(ownerThreads.docs.map(({ id }) => id)).toContain(thread.id);
    expect(ownerMessages.docs.map(({ id }) => id)).toContain('private-message');
  });
});

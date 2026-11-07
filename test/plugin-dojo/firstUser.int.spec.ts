import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from 'frogbot/internal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveSignInIdentity } from '../../packages/frogbot/src/auth/signIn/identity.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { dojoEnv, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const sharer = 'sam@example.com';

describe('dojo() on an app shared to Dojo empty', () => {
  const previousEnv = { ...process.env };
  let booted: BootedFrogBot;

  const users = async () =>
    (
      await booted.frogbot.find({
        collection: usersSlug,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })
    ).docs as { id: number | string; email: string }[];

  const rerunOnInit = async () => {
    for (const onInit of [booted.frogbot.config.onInit ?? []].flat()) {
      await onInit(booted.frogbot);
    }
  };

  const signIn = async (email: string) =>
    resolveSignInIdentity({
      req: await booted.frogbot.createRequest(),
      collectionSlug: usersSlug,
      email,
    });

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;

    Object.assign(process.env, dojoEnv, {
      DOJO_FIRST_USER_EMAIL: sharer,
      FROGBOT_CONFIG_PATH: path.join(dirname, 'config.ts'),
    });

    await loadConfig({ cwd: dirname });

    booted = await bootFrogBot(dirname, 'plugin-dojo-first-user');
  });

  afterAll(async () => {
    await booted?.shutdown();
    process.env = previousEnv;
  });

  it('starts with the sharer as its only user', async () => {
    expect((await users()).map(({ email }) => email)).toEqual([sharer]);
  });

  it('adds nobody on the next start', async () => {
    await rerunOnInit();

    expect((await users()).map(({ email }) => email)).toEqual([sharer]);
  });

  it('"Continue with Dojo" with the sharer\'s email signs in as the seeded user', async () => {
    const [seeded] = await users();

    expect(await signIn(sharer)).toBe(seeded.id);
  });

  it("refuses another Dojo account through the collection's own access.create", async () => {
    await expect(signIn('stranger@example.com')).rejects.toThrow();
    expect(await users()).toHaveLength(1);
  });

  it('adds nobody to an app that already has a user', async () => {
    await booted.frogbot.delete({
      collection: usersSlug,
      where: { id: { exists: true } },
      overrideAccess: true,
    });

    await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'local@frogbot.local', password: 'frogbot-int-password' },
      overrideAccess: true,
    });

    await rerunOnInit();

    expect((await users()).map(({ email }) => email)).toEqual(['local@frogbot.local']);
  });
});

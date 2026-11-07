import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startDojoApp } from './dojoApp.js';

const SHARER = 'sam@example.com';

describe(`The Dojo sharer as the first user [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let dojo: Awaited<ReturnType<typeof startDojoApp>>;

  const rerunOnInit = () => dojo.frogbot.config.onInit?.(dojo.frogbot);

  beforeAll(async () => {
    dojo = await startDojoApp({
      name: 'dojo-first-user',
      collection: { auth: { verify: true } },
      env: { DOJO_FIRST_USER_EMAIL: ' Sam@Example.com ' },
      onInit: true,
    });
  });

  afterAll(async () => {
    await dojo?.close();
  });

  it('starts an empty app with the sharer as its one verified user', async () => {
    const users = await dojo.users();

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: SHARER, _verified: true });
  });

  it('signs the sharer in with Dojo as that user, and refuses a stranger under default access', async () => {
    const [seeded] = await dojo.users(SHARER);
    const sharer = await dojo.signIn({ sub: '1', email: SHARER });

    expect(sharer.status).toBe(200);
    expect(await dojo.me(sharer)).toMatchObject({ id: seeded.id, email: SHARER });

    const stranger = await dojo.signIn({ sub: '2', email: 'eve@example.com' });

    expect(stranger.status).toBe(403);
    expect(dojo.session(stranger)).toBeUndefined();
    expect(await dojo.users('eve@example.com')).toEqual([]);
  });

  it('adds nothing on the next start', async () => {
    const before = await dojo.users();

    await rerunOnInit();

    expect(await dojo.users()).toEqual(before);
  });

  it('leaves an app that already has a user alone, even when the sharer is not one', async () => {
    await dojo.frogbot.delete({
      collection: 'users',
      where: { id: { exists: true } },
      overrideAccess: true,
    });

    await dojo.frogbot.create({
      collection: 'users',
      data: { email: 'local@example.com', password: 'local-password-123', _verified: true },
      overrideAccess: true,
    });

    await rerunOnInit();

    expect((await dojo.users()).map(({ email }) => email)).toEqual(['local@example.com']);
  });
});

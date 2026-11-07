import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startDojoApp } from './dojoApp.js';

describe(`Sign in with Dojo [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let dojo: Awaited<ReturnType<typeof startDojoApp>>;
  let openSignUps = false;

  beforeAll(async () => {
    dojo = await startDojoApp({
      name: 'dojo-sign-in',
      collection: { access: { create: () => openSignUps } },
    });
  });

  afterAll(async () => {
    await dojo?.close();
  });

  beforeEach(() => {
    openSignUps = false;
    dojo.refusals.length = 0;
  });

  it("gives an empty app's first Dojo visitor an account, with a working session", async () => {
    const response = await dojo.signIn({ sub: '1', email: 'ada@example.com', name: 'Ada' });

    expect(response.status).toBe(200);
    expect(dojo.refusals).toEqual([]);
    expect(await dojo.users('ada@example.com')).toHaveLength(1);
    expect(await dojo.me(response)).toMatchObject({ email: 'ada@example.com' });
  });

  it('signs an existing user in as themselves', async () => {
    const [before] = await dojo.users('ada@example.com');
    const response = await dojo.signIn({ sub: '1', email: 'ada@example.com', name: 'Ada' });

    expect(response.status).toBe(200);
    expect(dojo.session(response)).toBeDefined();
    expect((await dojo.users('ada@example.com')).map(({ id }) => id)).toEqual([before.id]);
  });

  it("refuses a new email when the app's access.create does", async () => {
    const response = await dojo.signIn({ sub: '2', email: 'bob@example.com' });

    expect(response.status).toBe(403);
    expect(dojo.session(response)).toBeUndefined();
    expect(await dojo.users('bob@example.com')).toEqual([]);
  });

  it('accepts a new email when access.create allows it', async () => {
    openSignUps = true;

    const response = await dojo.signIn({ sub: '2', email: 'bob@example.com' });

    expect(response.status).toBe(200);
    expect(dojo.session(response)).toBeDefined();
    expect(await dojo.users('bob@example.com')).toHaveLength(1);
  });

  it('signs a password user in by email, whatever case Dojo sends it in', async () => {
    const own = await dojo.frogbot.create({
      collection: 'users',
      data: { email: 'cy@example.com', password: 'cy-password-123' },
      overrideAccess: true,
    });

    const response = await dojo.signIn({ sub: '3', email: 'Cy@Example.COM' });

    expect(response.status).toBe(200);
    expect(await dojo.me(response)).toMatchObject({ id: own.id, email: 'cy@example.com' });
    expect(await dojo.users('cy@example.com')).toHaveLength(1);
  });

  it('refuses an email Dojo has not verified, even with open sign-ups', async () => {
    openSignUps = true;

    const response = await dojo.signIn({
      sub: '4',
      email: 'eve@example.com',
      email_verified: false,
    });

    expect(response.status).not.toBe(200);
    expect(dojo.session(response)).toBeUndefined();
    expect(await dojo.users('eve@example.com')).toEqual([]);
  });

  it('refuses to sign in as an existing user when Dojo has not verified the email', async () => {
    const response = await dojo.signIn({
      sub: '5',
      email: 'ada@example.com',
      email_verified: false,
    });

    expect(response.status).not.toBe(200);
    expect(dojo.session(response)).toBeUndefined();
  });
});

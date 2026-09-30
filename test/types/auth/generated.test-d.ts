import type { FrogBotInstance, FrogBotRequest, TypedUser } from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { Admin, Config, User } from './.generated/frogbot-types.js';

declare const frogbot: FrogBotInstance;
declare const admin: Admin;
declare const user: User;

expectTypeOf<TypedUser>().toEqualTypeOf<Config['user']>();
expectTypeOf<FrogBotRequest['user']>().toEqualTypeOf<User | Admin | null>();

export function describeUser(req: FrogBotRequest) {
  if (req.user?.collection === 'admins') {
    expectTypeOf(req.user).toEqualTypeOf<Admin>();
    expectTypeOf(req.user.level).toEqualTypeOf<number>();

    return `admin level ${req.user.level}`;
  }

  if (req.user) {
    expectTypeOf(req.user).toEqualTypeOf<User>();
    expectTypeOf(req.user.nickname).toEqualTypeOf<string | null | undefined>();

    return req.user.nickname ?? req.user.email;
  }

  return 'anonymous';
}

export async function requestAsAdmin() {
  return frogbot.createRequest({ user: admin });
}

export async function requestAsUser() {
  return frogbot.createRequest({ user });
}

export async function requestAsMixedUser() {
  // @ts-expect-error An admins user needs its level.
  return frogbot.createRequest({ user: { ...user, collection: 'admins' } });
}

export async function requestAsPartialAdmin() {
  return frogbot.createRequest({
    // @ts-expect-error A partial admins user is not a generated user.
    user: { id: admin.id, collection: 'admins', level: admin.level },
  });
}

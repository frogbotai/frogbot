import type {
  Access,
  AgentAccess,
  CollectionBeforeChangeHook,
  Endpoint,
  FieldHook,
  FrogBotInstance,
  FrogBotRequest,
  LivePreviewURLArgs,
  PieceChannel,
  ToolCtx,
  TypedUser,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { SelectUser } from '../../select/frogbot-types.js';

declare const frogbot: FrogBotInstance;
declare const headers: Headers;
declare const selectUser: SelectUser;

type Channel = PieceChannel<unknown, unknown, unknown>;

// @ts-expect-error FrogBotRequest uses generated types, not a user type argument.
export type CustomUserRequest = FrogBotRequest<SelectUser>;

expectTypeOf<TypedUser>().toEqualTypeOf<SelectUser>();
expectTypeOf<FrogBotRequest['user']>().toEqualTypeOf<SelectUser | null>();
expectTypeOf<Parameters<FieldHook>[0]['req']['user']>().toEqualTypeOf<SelectUser | null>();
expectTypeOf<LivePreviewURLArgs['req']['user']>().toEqualTypeOf<SelectUser | null>();
expectTypeOf<ToolCtx['req']['user']>().toEqualTypeOf<SelectUser | null>();
expectTypeOf<Parameters<AgentAccess>[0]['req']['user']>().toEqualTypeOf<SelectUser | null>();

export const canRead: Access = ({ req }) => {
  expectTypeOf(req.user).toEqualTypeOf<SelectUser | null>();

  return Boolean(req.user);
};

export const stampOwner: CollectionBeforeChangeHook = ({ data, req }) => {
  expectTypeOf(req.user).toEqualTypeOf<SelectUser | null>();

  if (req.user) {
    expectTypeOf(req.user.email).toEqualTypeOf<string>();

    return { ...data, ownerEmail: req.user.email };
  }

  return data;
};

export const whoami: Endpoint = {
  method: 'get',
  path: '/whoami',
  handler: (req) => {
    expectTypeOf(req.user).toEqualTypeOf<SelectUser | null>();

    return Response.json({ email: req.user?.email ?? null });
  },
};

export async function requestFromAuth() {
  const { user } = await frogbot.auth({ headers });

  expectTypeOf(user).toEqualTypeOf<SelectUser | null>();

  return frogbot.createRequest({ user });
}

export async function requestFromFullUser() {
  return frogbot.createRequest({ user: selectUser });
}

export async function requestFromPartialUser() {
  // @ts-expect-error A partial user is not a generated user.
  return frogbot.createRequest({ user: { id: 1 } });
}

export const identity: Channel['identity'] = async () => selectUser;

// @ts-expect-error A channel identity must resolve the generated user.
export const partialIdentity: Channel['identity'] = async () => ({ id: 1 });

import type { Access, AgentAccess, FieldAccess, FrogbotRequest } from 'frogbot';
import type { Where } from 'payload';
import { expectTypeOf } from 'vitest';

import { allow } from './index.js';

const booleanAccess = allow('member', ({ data, id, req }) => Boolean(data || id || req.user));
const ownAccess = allow({ role: 'member', own: 'owner' });
const whereAccess = allow((): Where => ({ owner: { exists: true } }));

expectTypeOf(booleanAccess).toMatchTypeOf<Access>();
expectTypeOf(booleanAccess).toMatchTypeOf<FieldAccess>();
expectTypeOf(booleanAccess).toMatchTypeOf<AgentAccess>();
expectTypeOf(ownAccess).toMatchTypeOf<Access>();
expectTypeOf(whereAccess).toMatchTypeOf<Access>();

// @ts-expect-error Where results are invalid for field access.
const ownField: FieldAccess = ownAccess;
// @ts-expect-error Where results are invalid for agent access.
const ownAgent: AgentAccess = ownAccess;
// @ts-expect-error Where-returning functions are invalid for field access.
const whereField: FieldAccess = whereAccess;
// @ts-expect-error Where-returning functions are invalid for agent access.
const whereAgent: AgentAccess = whereAccess;

expectTypeOf(ownField).toEqualTypeOf<FieldAccess>();
expectTypeOf(ownAgent).toEqualTypeOf<AgentAccess>();
expectTypeOf(whereField).toEqualTypeOf<FieldAccess>();
expectTypeOf(whereAgent).toEqualTypeOf<AgentAccess>();
expectTypeOf<FrogbotRequest>().toMatchTypeOf<Parameters<typeof booleanAccess>[0]['req']>();

import type { FrogbotRequest } from 'frogbot';
import type { Where } from 'payload';

import { resolveRequestRoles } from './resolve.js';
import type {
  BooleanClause,
  Clause,
  ClauseFunction,
  OwnClause,
  RoleAccessArgs,
  RoleResolver,
} from './types.js';

export const compiledAccess = Symbol('frogbot.compiledAccess');

export type CompiledBinding = {
  operation?: string;
  polymorphicOwnFields: ReadonlySet<string>;
  resolver: RoleResolver;
  roles: ReadonlySet<string>;
};

export type CompiledAccess<
  TArgs extends RoleAccessArgs = RoleAccessArgs,
  TResult extends boolean | Where = boolean | Where,
> = ((args: TArgs) => Promise<TResult>) & {
  [compiledAccess]: {
    binding?: CompiledBinding;
    clauses: readonly Clause<TArgs>[];
  };
};

function isOwnClause<TArgs extends RoleAccessArgs>(clause: Clause<TArgs>): clause is OwnClause {
  return typeof clause === 'object';
}

function ownWhere(req: FrogbotRequest, field: string, polymorphic: boolean): Where {
  const value = polymorphic
    ? {
        relationTo: (req.user as unknown as { collection: string }).collection,
        value: req.user!.id,
      }
    : req.user!.id;
  return { [field]: { equals: value } };
}

function compile<TArgs extends RoleAccessArgs, TResult extends boolean | Where>(
  clauses: readonly Clause<TArgs>[],
  binding?: CompiledBinding,
): CompiledAccess<TArgs, TResult> {
  const access = async (args: TArgs): Promise<boolean | Where> => {
    const req = args.req;
    if (!req.user) return false;
    const configured = binding?.roles ?? new Set<string>();
    const assigned: readonly string[] = resolveRequestRoles(req, binding?.resolver);
    const wheres: Where[] = [];
    for (const clause of clauses) {
      if (typeof clause === 'string') {
        if (configured.has(clause) && assigned.includes(clause)) return true;
        continue;
      }
      if (isOwnClause(clause)) {
        if (!configured.has(clause.role) || !assigned.includes(clause.role)) continue;
        if (binding?.operation === 'create') return true;
        wheres.push(
          ownWhere(req, clause.own, binding?.polymorphicOwnFields.has(clause.own) ?? false),
        );
        continue;
      }
      const result = await (clause as ClauseFunction<TArgs>)(args);
      if (result === true) return true;
      if (result !== false) wheres.push(result);
    }
    if (wheres.length === 0) return false;
    if (wheres.length === 1) return wheres[0]!;
    return { or: wheres };
  };
  const compiled = access as CompiledAccess<TArgs, TResult>;
  compiled[compiledAccess] = { binding, clauses };
  return compiled;
}

export function isCompiledAccess(value: unknown): value is CompiledAccess {
  return typeof value === 'function' && compiledAccess in value;
}

export function bindCompiledAccess(
  access: CompiledAccess,
  binding: CompiledBinding,
): CompiledAccess {
  return compile(access[compiledAccess].clauses, binding);
}

export function allow<TArgs extends RoleAccessArgs = RoleAccessArgs>(
  ...clauses: readonly BooleanClause<TArgs>[]
): CompiledAccess<TArgs, boolean>;
export function allow<TArgs extends RoleAccessArgs = RoleAccessArgs>(
  ...clauses: readonly Clause<TArgs>[]
): CompiledAccess<TArgs, boolean | Where>;
export function allow(...clauses: readonly Clause<RoleAccessArgs>[]): CompiledAccess {
  return compile(clauses);
}

import type { AIAccessFn, AIConfig } from 'frogbot';

import { assertModelAllowed, policyUser, readPolicy } from './policy.js';

type AIAccess = NonNullable<AIConfig['access']>;

const categories = ['generate', 'embed', 'transcribe', 'rerank', 'evaluate'] as const;

function policyAccess(base: AIAccessFn | undefined, authCollection: string): AIAccessFn {
  return async (args) => {
    const allowed = base ? await base(args) : Boolean(args.req.user);
    const user = policyUser(args.req.user, authCollection);

    if (!allowed || !user) return allowed;

    assertModelAllowed(readPolicy(user), args.model);

    return true;
  };
}

/**
 * Wraps each `ai.access` function: the app's rule must allow, then the user's model list. Core
 * also calls access to filter chat and agent lists, so the budget is left to `beforeOperation`:
 * a spent budget fails on send instead of hiding every agent.
 */
export function createPolicyAccess({
  access,
  authCollection,
}: {
  access: AIAccess | undefined;
  authCollection: string;
}): Required<AIAccess> {
  return Object.fromEntries(
    categories.map((category) => [category, policyAccess(access?.[category], authCollection)]),
  ) as Required<AIAccess>;
}

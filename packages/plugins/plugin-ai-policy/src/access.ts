import type { AIAccessFn, AIConfig } from 'frogbot';

import {
  assertKeyModelAllowed,
  assertModelAllowed,
  policyKey,
  policyUser,
  readPolicy,
} from './policy.js';

type AIAccess = NonNullable<AIConfig['access']>;

type PolicyAccessOptions = {
  authCollection: string;
  keysCollection?: string;
};

const categories = ['generate', 'embed', 'transcribe', 'rerank', 'evaluate'] as const;

function policyAccess(base: AIAccessFn | undefined, options: PolicyAccessOptions): AIAccessFn {
  return async (args) => {
    const allowed = base ? await base(args) : Boolean(args.req.user);
    const user = policyUser(args.req.user, options.authCollection);

    if (!allowed || !user) return allowed;

    assertModelAllowed(readPolicy(user), args.model);

    const key = options.keysCollection ? policyKey(user) : undefined;

    if (key) assertKeyModelAllowed(key, args.model);

    return true;
  };
}

/**
 * Wraps each `ai.access` function: the app's rule must allow, then the user's model list, then the
 * API key's. Core also calls access to filter chat and agent lists, so budgets are left to
 * `beforeOperation`: a spent budget fails on send instead of hiding every agent.
 */
export function createPolicyAccess({
  access,
  ...options
}: PolicyAccessOptions & { access: AIAccess | undefined }): Required<AIAccess> {
  return Object.fromEntries(
    categories.map((category) => [category, policyAccess(access?.[category], options)]),
  ) as Required<AIAccess>;
}

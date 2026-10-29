import {
  type AIAfterOperationHook,
  type AIBeforeOperationHook,
  calculateUsageCostUSD,
} from 'frogbot';

import { assertBudget, assertKeyBudget, policyKey, policyUser, readPolicy } from './policy.js';

type SpendDocument = { spendThisPeriodUSD?: number };

class SerialQueue {
  private readonly updates = new Map<string, Promise<void>>();

  run(subject: string, update: () => Promise<void>): Promise<void> {
    const next = (this.updates.get(subject) ?? Promise.resolve()).then(update, update);
    let owner: Promise<void>;

    const release = () => {
      if (this.updates.get(subject) === owner) this.updates.delete(subject);
    };

    owner = next.then(release, release);
    this.updates.set(subject, owner);

    return next;
  }
}

type PolicyHooksOptions = {
  authCollection: string;
  keysCollection?: string;
};

export function createPolicyHooks({ authCollection, keysCollection }: PolicyHooksOptions): {
  beforeOperation: AIBeforeOperationHook;
  afterOperation: AIAfterOperationHook;
} {
  const queue = new SerialQueue();

  return {
    beforeOperation: ({ req }) => {
      const user = policyUser(req?.user, authCollection);

      if (!user) return;

      assertBudget(readPolicy(user));

      const key = keysCollection ? policyKey(user) : undefined;

      if (key) assertKeyBudget(key);
    },
    afterOperation: async ({ req, model, usage, error }) => {
      const user = policyUser(req?.user, authCollection);

      if (!req || user?.id === undefined || error || !usage) return;

      const cost = calculateUsageCostUSD({
        model,
        providers: req.frogbot.config.ai?.providers,
        usage,
      });

      if (cost <= 0) return;

      const addSpend = async (collection: string, id: number | string) => {
        try {
          await queue.run(`${collection}:${id}`, async () => {
            const current = (await req.frogbot.findByID({
              collection,
              id,
              depth: 0,
              overrideAccess: true,
              req,
            })) as SpendDocument;

            await req.frogbot.update({
              collection,
              id,
              data: { spendThisPeriodUSD: (current.spendThisPeriodUSD ?? 0) + cost },
              overrideAccess: true,
              req,
            });
          });
        } catch (err) {
          req.frogbot.logger.error(
            { err, model, collection },
            '[plugin-ai-policy] Failed to record spend',
          );
        }
      };

      const key = keysCollection ? policyKey(user) : undefined;

      await Promise.all([
        addSpend(authCollection, user.id),
        ...(key && keysCollection ? [addSpend(keysCollection, key.id)] : []),
      ]);
    },
  };
}

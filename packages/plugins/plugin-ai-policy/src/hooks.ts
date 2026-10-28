import {
  type AIAfterOperationHook,
  type AIBeforeOperationHook,
  calculateUsageCostUSD,
} from 'frogbot';

import { assertBudget, policyUser, readPolicy } from './policy.js';

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

export function createPolicyHooks({ authCollection }: { authCollection: string }): {
  beforeOperation: AIBeforeOperationHook;
  afterOperation: AIAfterOperationHook;
} {
  const queue = new SerialQueue();

  return {
    beforeOperation: ({ req }) => {
      const user = policyUser(req?.user, authCollection);

      if (user) assertBudget(readPolicy(user));
    },
    afterOperation: async ({ req, model, usage, error }) => {
      const id = policyUser(req?.user, authCollection)?.id;

      if (!req || id === undefined || error || !usage) return;

      const cost = calculateUsageCostUSD({
        model,
        providers: req.frogbot.config.ai?.providers,
        usage,
      });

      if (cost <= 0) return;

      try {
        await queue.run(`${authCollection}:${id}`, async () => {
          const current = (await req.frogbot.findByID({
            collection: authCollection,
            id,
            depth: 0,
            overrideAccess: true,
            req,
          })) as SpendDocument;

          await req.frogbot.update({
            collection: authCollection,
            id,
            data: { spendThisPeriodUSD: (current.spendThisPeriodUSD ?? 0) + cost },
            overrideAccess: true,
            req,
          });
        });
      } catch (err) {
        req.frogbot.logger.error({ err, model }, '[plugin-ai-policy] Failed to record spend');
      }
    },
  };
}

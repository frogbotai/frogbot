import {
  type AIAfterOperationHook,
  type AIBeforeOperationHook,
  calculateUsageCostUSD,
  type FrogBotRequest,
} from 'frogbot';

import {
  assertBudget,
  assertKeyBudget,
  type PolicyKey,
  policyKey,
  policyUser,
  readPolicy,
} from './policy.js';

const keyID = (value: unknown): number | string | undefined => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value;

  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
};

async function keyLineage(
  req: FrogBotRequest,
  keysCollection: string,
  key: PolicyKey,
): Promise<PolicyKey[]> {
  const lineage = [key];
  const seen = new Set([key.id]);

  for (let parent = keyID(key.mintedBy); parent !== undefined && !seen.has(parent);) {
    seen.add(parent);

    const doc = (await req.frogbot
      .findByID({ collection: keysCollection, id: parent, depth: 0, overrideAccess: true, req })
      .catch(() => undefined)) as PolicyKey | undefined;

    if (!doc) break;

    lineage.push(doc);
    parent = keyID(doc.mintedBy);
  }

  return lineage;
}

type PolicyHooksOptions = {
  authCollection: string;
  keysCollection?: string;
};

export function createPolicyHooks({ authCollection, keysCollection }: PolicyHooksOptions): {
  beforeOperation: AIBeforeOperationHook;
  afterOperation: AIAfterOperationHook;
} {
  return {
    beforeOperation: async ({ req }) => {
      const user = policyUser(req?.user, authCollection);

      if (!req || !user) return;

      assertBudget(readPolicy(user));

      const key = keysCollection ? policyKey(user) : undefined;

      if (!key || !keysCollection) return;

      for (const each of await keyLineage(req, keysCollection, key)) assertKeyBudget(each);
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
          await req.frogbot.db.updateOne({
            collection,
            where: {
              and: [{ id: { equals: id } }, { spendThisPeriodUSD: { equals: null } }],
            },
            data: { spendThisPeriodUSD: 0 },
            options: { atomic: true },
            returning: false,
          });

          await req.frogbot.db.updateOne({
            collection,
            id,
            data: { spendThisPeriodUSD: { $inc: cost } },
            returning: false,
          });
        } catch (err) {
          req.frogbot.logger.error(
            { err, model, collection },
            '[plugin-ai-policy] Failed to record spend',
          );
        }
      };

      const key = keysCollection ? policyKey(user) : undefined;
      const keySpends =
        key && keysCollection
          ? (await keyLineage(req, keysCollection, key)).map(({ id }) =>
              addSpend(keysCollection, id),
            )
          : [];

      await Promise.all([addSpend(authCollection, user.id), ...keySpends]);
    },
  };
}

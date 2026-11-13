import {
  type AIAfterOperationHook,
  type AIBeforeOperationHook,
  calculateUsageCostUSD,
  type FrogBotRequest,
} from 'frogbot';

import { addSpend, readSpend, spendOf, type SpendSubject } from './counters.js';
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
  const options = { authCollection, keysCollection };

  return {
    beforeOperation: async ({ req }) => {
      const user = policyUser(req?.user, authCollection);

      if (!req || user?.id === undefined) return;

      const key = keysCollection ? policyKey(user) : undefined;
      const lineage = key && keysCollection ? await keyLineage(req, keysCollection, key) : [];
      const subjects: SpendSubject[] = [
        { collection: authCollection, id: user.id },
        ...lineage.map(({ id }) => ({ collection: keysCollection as string, id })),
      ];

      const spend = await readSpend(req, subjects);

      assertBudget({ ...readPolicy(user), spendThisPeriodUSD: spendOf(spend, subjects[0]) });

      lineage.forEach((each, index) =>
        assertKeyBudget({ ...each, spendThisPeriodUSD: spendOf(spend, subjects[index + 1]) }),
      );
    },
    afterOperation: async ({ req, model, usage, error }) => {
      const user = policyUser(req?.user, authCollection);

      if (!req || user?.id === undefined || error || !usage) return;

      const cost = calculateUsageCostUSD({
        model,
        providers: req.frogbot.config.ai?.providers,
        usage,
      });

      if (!Number.isFinite(cost) || cost <= 0) return;

      const key = keysCollection ? policyKey(user) : undefined;
      const lineage = key && keysCollection ? await keyLineage(req, keysCollection, key) : [];
      const subjects: SpendSubject[] = [
        { collection: authCollection, id: user.id },
        ...lineage.map(({ id }) => ({ collection: keysCollection as string, id })),
      ];

      const record = async () => {
        for (const subject of subjects) {
          await addSpend(req, subject, cost, options).catch((err: unknown) => {
            req.frogbot.logger.error(
              { err, model, collection: subject.collection },
              '[plugin-ai-policy] Failed to record spend',
            );
          });
        }
      };

      if (req.transactionID) void record();
      else await record();
    },
  };
}

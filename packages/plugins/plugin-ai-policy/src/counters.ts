import type {
  Access,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  FrogBotRequest,
  Where,
} from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

export const SPEND_COUNTERS_SLUG = 'plugin-ai-policy-spend';

export type SpendSubject = { collection: string; id: number | string };

type Counter = { id: number | string; amount?: number; period?: string };

/** The UTC calendar month a cost belongs to, as `YYYY-MM`. */
export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

const counterKey = ({ collection, id }: SpendSubject) => `${collection}:${String(id)}`;

function prefixWhere(where: Where, prefix: string): Where {
  return Object.fromEntries(
    Object.entries(where).map(([path, value]) =>
      path === 'and' || path === 'or'
        ? [path, (value as Where[]).map((each) => prefixWhere(each, prefix))]
        : [`${prefix}.${path}`, value],
    ),
  );
}

function readThroughSubject(subjects: Record<string, string>): Access {
  return async (args) => {
    const req = toPayloadRequest(args.req);
    const allowed: Where[] = [];

    for (const [field, slug] of Object.entries(subjects)) {
      const read = req.payload.collections[slug]?.config.access.read;
      const result = read
        ? await read({ req, slug } as Parameters<typeof read>[0])
        : Boolean(req.user);

      if (result === true) allowed.push({ [field]: { exists: true } });
      if (result && typeof result === 'object') {
        allowed.push({ and: [{ [field]: { exists: true } }, prefixWhere(result, field)] });
      }
    }

    return allowed.length > 0 ? { or: allowed } : false;
  };
}

export function createSpendCounters({
  authCollection,
  keysCollection,
}: {
  authCollection: string;
  keysCollection?: string;
}): CollectionConfig {
  const subjects: Record<string, string> = {
    user: authCollection,
    ...(keysCollection && { apiKey: keysCollection }),
  };

  return {
    slug: SPEND_COUNTERS_SLUG,
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
    typescript: { interface: 'PluginAiPolicySpend' },
    admin: { hidden: true },
    access: {
      create: () => false,
      read: readThroughSubject(subjects),
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'key', type: 'text', required: true, unique: true },
      { name: 'period', type: 'text', required: true },
      { name: 'amount', type: 'number', required: true, defaultValue: 0 },
      ...Object.entries(subjects).map(([name, relationTo]) => ({
        name,
        type: 'relationship' as const,
        relationTo,
        index: true,
      })),
    ],
  };
}

type SpendOptions = { authCollection: string; keysCollection?: string };

/**
 * Adds `cost` to the subject's counter for this month in single statements on the counter row,
 * never on the user or key row, and outside the caller's transaction.
 */
export async function addSpend(
  req: FrogBotRequest,
  subject: SpendSubject,
  cost: number,
  options: SpendOptions,
): Promise<void> {
  const { db } = req.frogbot;
  const key = counterKey(subject);
  const period = currentPeriod();

  const bump = async () =>
    (await db.updateOne({
      collection: SPEND_COUNTERS_SLUG,
      where: { and: [{ key: { equals: key } }, { period: { equals: period } }] },
      data: { amount: { $inc: cost } },
      options: { atomic: true },
    })) as Counter | null;

  const rollOver = async () =>
    (await db.updateOne({
      collection: SPEND_COUNTERS_SLUG,
      where: { and: [{ key: { equals: key } }, { period: { not_equals: period } }] },
      data: { amount: cost, period },
      options: { atomic: true },
    })) as Counter | null;

  let counter = (await bump()) ?? (await rollOver());

  if (!counter) {
    const field = subject.collection === options.authCollection ? 'user' : 'apiKey';

    counter = (await db
      .create({
        collection: SPEND_COUNTERS_SLUG,
        data: { key, period, amount: cost, [field]: subject.id },
      })
      .catch(async (err: unknown) => {
        const retried = await bump();

        if (!retried) throw err;

        return retried;
      })) as Counter;
  }

  await db.updateOne({
    collection: subject.collection,
    where: {
      and: [
        { id: { equals: subject.id } },
        { or: [{ spendCounter: { exists: false } }, { spendCounter: { not_equals: counter.id } }] },
      ],
    },
    data: { spendCounter: counter.id, updatedAt: null },
    options: { atomic: true },
    returning: false,
  });
}

const PENDING_SPEND = 'plugin-ai-policy:pendingSpend';

function pendingSpend(req: FrogBotRequest): Map<string, number> {
  req.context ??= {};

  const existing = req.context[PENDING_SPEND];

  if (existing instanceof Map) return existing as Map<string, number>;

  const created = new Map<string, number>();

  req.context[PENDING_SPEND] = created;

  return created;
}

/** Counts `cost` against the subjects for this request until `settle` says its write finished. */
export function holdSpend(
  req: FrogBotRequest,
  subjects: SpendSubject[],
  cost: number,
): (subject: SpendSubject) => void {
  const pending = pendingSpend(req);
  const change = (subject: SpendSubject, by: number) => {
    const key = counterKey(subject);
    const next = (pending.get(key) ?? 0) + by;

    if (next > 1e-9) pending.set(key, next);
    else pending.delete(key);
  };

  subjects.forEach((subject) => change(subject, cost));

  return (subject) => change(subject, -cost);
}

/**
 * This month's spend per subject: the committed counters, read outside the caller's transaction
 * so a snapshot can't hide them, plus what this request charged that isn't written yet.
 */
export async function readSpend(
  req: FrogBotRequest,
  subjects: SpendSubject[],
): Promise<Map<string, number>> {
  const keys = subjects.map(counterKey);
  const pending = new Map(pendingSpend(req));
  const { docs } = await req.frogbot.find({
    collection: SPEND_COUNTERS_SLUG,
    where: { and: [{ key: { in: keys } }, { period: { equals: currentPeriod() } }] },
    depth: 0,
    limit: keys.length,
    overrideAccess: true,
  });

  const committed = new Map(
    docs.map((doc) => [String(doc.key), typeof doc.amount === 'number' ? doc.amount : 0]),
  );

  return new Map(keys.map((key) => [key, (committed.get(key) ?? 0) + (pending.get(key) ?? 0)]));
}

export function spendOf(spend: Map<string, number>, subject: SpendSubject): number {
  return spend.get(counterKey(subject)) ?? 0;
}

function createCounterOnCreate(
  field: 'user' | 'apiKey',
  collection: string,
): CollectionAfterChangeHook {
  return async ({ doc, operation, req }) => {
    if (operation !== 'create') return doc;

    const rotatedFrom = field === 'apiKey' ? req.context?.apiKeyRotatedFrom : undefined;
    const from =
      typeof rotatedFrom === 'string' || typeof rotatedFrom === 'number' ? rotatedFrom : undefined;

    const amount =
      from === undefined
        ? 0
        : spendOf(await readSpend(req, [{ collection, id: from }]), { collection, id: from });

    const counter = (await req.frogbot.create({
      collection: SPEND_COUNTERS_SLUG,
      data: {
        key: counterKey({ collection, id: doc.id }),
        period: currentPeriod(),
        amount,
        [field]: doc.id,
      },
      overrideAccess: true,
      req,
    })) as Counter;

    await req.frogbot.db.updateOne({
      collection,
      id: doc.id,
      data: { spendCounter: counter.id },
      req: toPayloadRequest(req),
      returning: false,
    });

    return { ...doc, spendCounter: counter.id, spendThisPeriodUSD: amount };
  };
}

function deleteCounterOnDelete(collection: string): CollectionAfterDeleteHook {
  return async ({ id, req }) => {
    await req.frogbot.delete({
      collection: SPEND_COUNTERS_SLUG,
      where: { key: { equals: counterKey({ collection, id }) } },
      overrideAccess: true,
      req,
    });
  };
}

/** Gives a user or key collection its spend counter: one per document, created and deleted with it. */
export function withSpendCounter(
  collection: CollectionConfig,
  field: 'user' | 'apiKey',
): CollectionConfig {
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterChange: [
        ...(collection.hooks?.afterChange ?? []),
        createCounterOnCreate(field, collection.slug),
      ],
      afterDelete: [
        ...(collection.hooks?.afterDelete ?? []),
        deleteCounterOnDelete(collection.slug),
      ],
    },
  };
}

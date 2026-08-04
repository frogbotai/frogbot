export type PolicyMode = 'inherit' | 'custom' | 'unlimited';

export type PolicyValue<T> = {
  mode?: PolicyMode;
  value?: T;
};

export type PolicyDocument = {
  monthlyBudget?: PolicyValue<number>;
  rpm?: PolicyValue<number>;
  tpm?: PolicyValue<number>;
  models?: PolicyValue<string[]>;
  spendThisPeriodUSD?: number;
  budgetBehavior?: 'block' | 'alert-only';
};

export type PolicyDefaults = {
  monthlyBudgetUSD?: number;
  rpm?: number;
  tpm?: number;
  models?: string[];
  budgetBehavior?: 'block' | 'alert-only';
};

export type EffectivePolicy = PolicyDefaults & {
  spendThisPeriodUSD: number;
};

export class SerialQueue {
  private readonly updates = new Map<string, Promise<void>>();

  get pending(): number {
    return this.updates.size;
  }

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

function resolveValue<T>(key: PolicyValue<T> | undefined, user: PolicyValue<T> | undefined, fallback: T | undefined): T | undefined {
  for (const policy of [key, user]) {
    if (policy?.mode === 'unlimited') return undefined;
    if (policy?.mode === 'custom') return policy.value;
  }
  return fallback;
}

export function resolvePolicy(args: { key?: PolicyDocument; user?: PolicyDocument; defaults?: PolicyDefaults }): EffectivePolicy {
  const { key, user, defaults = {} } = args;
  const budgetSpend = key?.monthlyBudget?.mode === 'custom'
    ? key.spendThisPeriodUSD
    : key?.monthlyBudget?.mode === 'unlimited'
      ? 0
      : user?.monthlyBudget?.mode === 'custom'
        ? user.spendThisPeriodUSD
        : key?.spendThisPeriodUSD ?? user?.spendThisPeriodUSD;
  return {
    monthlyBudgetUSD: resolveValue(key?.monthlyBudget, user?.monthlyBudget, defaults.monthlyBudgetUSD),
    rpm: resolveValue(key?.rpm, user?.rpm, defaults.rpm),
    tpm: resolveValue(key?.tpm, user?.tpm, defaults.tpm),
    models: resolveValue(key?.models, user?.models, defaults.models),
    budgetBehavior: key?.budgetBehavior ?? user?.budgetBehavior ?? defaults.budgetBehavior ?? 'block',
    spendThisPeriodUSD: budgetSpend ?? 0,
  };
}

type WindowEntry = { requests: number[]; tokens: Array<{ at: number; value: number }> };

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, WindowEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  admit(subject: string, policy: Pick<EffectivePolicy, 'rpm' | 'tpm'>): { kind: 'rpm' | 'tpm'; retryAfterSeconds: number } | undefined {
    const now = this.now();
    const entry = this.get(subject, now);
    const retry = (at: number) => Math.max(1, Math.ceil((at + 60_000 - now) / 1000));
    if (policy.rpm !== undefined && entry.requests.length >= policy.rpm) return { kind: 'rpm', retryAfterSeconds: retry(entry.requests[0]!) };
    const tokens = entry.tokens.reduce((sum, item) => sum + item.value, 0);
    if (policy.tpm !== undefined && tokens >= policy.tpm) return { kind: 'tpm', retryAfterSeconds: retry(entry.tokens[0]?.at ?? now) };
    entry.requests.push(now);
    return undefined;
  }

  settle(subject: string, tokens: number): void {
    if (tokens <= 0) return;
    this.get(subject, this.now()).tokens.push({ at: this.now(), value: tokens });
  }

  private get(subject: string, now: number): WindowEntry {
    const entry = this.windows.get(subject) ?? { requests: [], tokens: [] };
    entry.requests = entry.requests.filter((at) => at > now - 60_000);
    entry.tokens = entry.tokens.filter(({ at }) => at > now - 60_000);
    this.windows.set(subject, entry);
    return entry;
  }
}

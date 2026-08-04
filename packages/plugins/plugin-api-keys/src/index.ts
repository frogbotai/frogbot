import type { CollectionConfig, Plugin } from 'frogbot';
import { calculateModelCostUSD } from '@frogbotai/gateway';
import { BudgetExceededError, ModelNotAllowedError, RateLimitExceededError } from '@frogbotai/gateway/errors';

import { createApiKeysCollection } from './collection.js';
import { createPolicyFields } from './fields.js';
import { SerialQueue, SlidingWindowRateLimiter, resolvePolicy } from './policy.js';
import type { PolicyDocument } from './policy.js';
import { createApiKeyStrategy } from './strategy.js';

export type { ApiKeyHeaderOptions, ApiKeyTokenOptions } from './server/token.js';
export type { EffectivePolicy, PolicyDefaults, PolicyDocument, PolicyMode, PolicyValue } from './policy.js';
export {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from './server/token.js';

export type ApiKeysPluginOptions = {
  authCollection?: string;
  collectionSlug?: string;
  tokenPrefix?: string;
  headerNames?: string[];
  collection?: Partial<CollectionConfig>;
  defaults?: import('./policy.js').PolicyDefaults;
  alerts?: {
    webhookURL: string;
    thresholds?: number[];
    headers?: Record<string, string>;
  };
};

type PolicyContext = {
  policy?: ReturnType<typeof resolvePolicy>;
  policySubjects?: Array<{ subject: string; policy: ReturnType<typeof resolvePolicy> }>;
  policyKey?: Record<string, unknown>;
};

export function apiKeysPlugin(options: ApiKeysPluginOptions = {}): Plugin {
  for (const [name, value] of Object.entries(options.defaults ?? {})) {
    if (name !== 'models' && name !== 'budgetBehavior' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error(`[plugin-api-keys] Default '${name}' must be a non-negative finite number.`);
  }
  if ((options.defaults?.rpm !== undefined && options.defaults.rpm < 1) || (options.defaults?.tpm !== undefined && options.defaults.tpm < 1)) throw new Error('[plugin-api-keys] RPM and TPM defaults must be at least 1.');
  if (options.defaults?.budgetBehavior !== undefined && !['block', 'alert-only'].includes(options.defaults.budgetBehavior)) throw new Error('[plugin-api-keys] Budget behavior must be block or alert-only.');
  if (options.defaults?.models?.some((model) => !model.includes('/'))) throw new Error('[plugin-api-keys] Default models must use provider/model IDs.');
  if (options.alerts && !options.alerts.webhookURL) throw new Error('[plugin-api-keys] Alert webhookURL is required.');
  if (options.alerts?.thresholds?.some((threshold) => !Number.isFinite(threshold) || threshold <= 0 || threshold > 1)) throw new Error('[plugin-api-keys] Alert thresholds must be greater than 0 and at most 1.');
  const limiter = new SlidingWindowRateLimiter();
  const queue = new SerialQueue();
  return (config) => {
    const authCollection = options.authCollection ?? 'users';
    const collectionSlug = options.collectionSlug ?? 'api-keys';
    const auth = config.collections.find((collection) => collection.slug === authCollection);
    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(`[plugin-api-keys] Auth collection '${authCollection}' must exist and have auth enabled.`);
    }
    const reservedPolicyFields = new Set(['monthlyBudget', 'rpm', 'tpm', 'models', 'budgetBehavior', 'spendThisPeriodUSD', 'budgetPeriodStartedAt', 'budgetAlertsSent']);
    const collision = auth.fields.find((field) => 'name' in field && reservedPolicyFields.has(field.name));
    if (collision && 'name' in collision) throw new Error(`[plugin-api-keys] Auth field '${collision.name}' is reserved.`);
    const existing = config.collections.find((collection) => collection.slug === collectionSlug);
    const usageLog = config.ai
      ? config.collections.find((item) => item.usageLog === true) ?? {
          slug: 'usage-logs',
          usageLog: true,
          fields: [],
        }
      : undefined;
    const collection = createApiKeysCollection({
      authCollection,
      collectionSlug,
      tokenPrefix: options.tokenPrefix ?? 'fb',
      usageCollection: usageLog?.slug,
      collection: options.collection,
      existing,
    });
    const strategy = createApiKeyStrategy({
      authCollection,
      collectionSlug,
      headerNames: options.headerNames,
      tokenPrefix: options.tokenPrefix ?? 'fb',
    });
    const usageField = {
      name: 'apiKey',
      type: 'relationship' as const,
      relationTo: collectionSlug,
      index: true,
    };
    const collections = config.collections.map((item) => {
      let next = item;
      if (item.slug === collectionSlug) next = collection;
      if (item.slug === authCollection) {
        const authConfig = typeof next.auth === 'object' ? next.auth : {};
        next = {
          ...next,
          fields: [...next.fields, ...createPolicyFields(true)],
          auth: {
            ...authConfig,
            strategies: [...(authConfig.strategies ?? []), strategy],
          },
        };
      }
      if (item === usageLog) next = { ...next, fields: [...next.fields, usageField] };
      return next;
    });
    const resetTask: NonNullable<NonNullable<typeof config.jobs>['tasks']>[number] = {
      slug: 'frogbot-reset-ai-budgets',
      schedule: [{ cron: '0 0 1 * *', queue: 'frogbot-reset-ai-budgets' }],
      handler: async ({ req }) => {
        for (const collection of [collectionSlug, authCollection]) {
          await req.payload.update({
            collection,
            where: { id: { exists: true } },
            data: { spendThisPeriodUSD: 0, budgetPeriodStartedAt: new Date().toISOString(), budgetAlertsSent: [] },
            overrideAccess: true,
            req,
          });
        }
        return { output: {} };
      },
    };
    const autoRun = config.jobs?.autoRun;
    const jobs = {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks ?? []), resetTask],
      autoRun: typeof autoRun === 'function'
        ? async (payload: Parameters<typeof autoRun>[0]) => [...(await autoRun(payload)), { allQueues: true, cron: '* * * * *' as const }]
        : [...(autoRun ?? []), { allQueues: true, cron: '* * * * *' as const }],
    };
    return {
      ...config,
      jobs: config.ai ? jobs : config.jobs,
      collections: [
        ...collections,
        ...(existing ? [] : [collection]),
        ...(usageLog && !config.collections.includes(usageLog)
          ? [{ ...usageLog, fields: [usageField] }]
          : []),
      ],
      ...(config.ai
        ? {
            ai: {
              ...config.ai,
              hooks: {
                ...config.ai.hooks,
                beforeOperation: [
                  ...(config.ai.hooks?.beforeOperation ?? []),
                  async (args) => {
                    const apiKeyId = args.req?.user?.apiKeyId;
                    if (!args.req?.user) return;
                    if (apiKeyId !== undefined) args.context.usageFields = { ...(args.context.usageFields as Record<string, unknown> | undefined), apiKey: apiKeyId };
                    if (!args.req.frogbot?.findByID) return;
                    const key = apiKeyId === undefined ? undefined : await args.req.frogbot.findByID({ collection: collectionSlug as never, id: apiKeyId as never, depth: 0, overrideAccess: true, req: args.req }) as Record<string, unknown>;
                    const user = args.req.user as PolicyDocument;
                    const policy = resolvePolicy({ key: key as PolicyDocument | undefined, user, defaults: options.defaults });
                    const userPolicy = resolvePolicy({ user, defaults: options.defaults });
                    const subjects = [
                      apiKeyId === undefined ? undefined : { subject: `key:${apiKeyId}`, policy },
                      { subject: `user:${args.req.user.id}`, policy: userPolicy },
                    ].filter((value): value is { subject: string; policy: ReturnType<typeof resolvePolicy> } => Boolean(value));
                    if (subjects.some(({ policy: current }) => current.budgetBehavior === 'block' && current.monthlyBudgetUSD !== undefined && current.spendThisPeriodUSD >= current.monthlyBudgetUSD)) throw new BudgetExceededError();
                    for (const { subject, policy: current } of subjects) {
                      const violation = limiter.admit(subject, current);
                      if (violation) throw new RateLimitExceededError(violation);
                    }
                    Object.assign(args.context as PolicyContext, { policy, policySubjects: subjects, policyKey: key });
                  },
                ],
                beforeUpstream: [
                  ...(config.ai.hooks?.beforeUpstream ?? []),
                  (args) => {
                    const models = (args.context as PolicyContext).policy?.models;
                    if (models && !models.includes(args.model)) throw new ModelNotAllowedError(args.model);
                  },
                ],
                afterOperation: [
                  ...(config.ai.hooks?.afterOperation ?? []),
                  async (args) => {
                    const context = args.context as PolicyContext;
                    const req = args.req;
                    if (!req?.user || args.error) return;
                    const tokens = args.usage?.totalTokens ?? 0;
                    for (const { subject } of context.policySubjects ?? []) limiter.settle(subject, tokens);
                    const cost = args.usage ? calculateModelCostUSD(args.model, args.usage) : 0;
                    if (cost <= 0) return;
                    const targets = [
                      req.user.apiKeyId === undefined ? undefined : { collection: collectionSlug, id: req.user.apiKeyId },
                      { collection: authCollection, id: req.user.id },
                    ].filter((target): target is { collection: string; id: string | number } => Boolean(target));
                    await Promise.all(targets.map((target) => queue.run(`${target.collection}:${target.id}`, async () => {
                      const doc = await req.frogbot.findByID({ collection: target.collection as never, id: target.id as never, depth: 0, overrideAccess: true, req }) as Record<string, unknown>;
                      const spend = (typeof doc.spendThisPeriodUSD === 'number' ? doc.spendThisPeriodUSD : 0) + cost;
                      const sent = Array.isArray(doc.budgetAlertsSent) ? doc.budgetAlertsSent.filter((value): value is number => typeof value === 'number') : [];
                      const policy = resolvePolicy({ key: (target.collection === collectionSlug ? doc : context.policyKey) as PolicyDocument | undefined, user: (target.collection === authCollection ? doc : req.user) as PolicyDocument, defaults: options.defaults });
                      const thresholds = options.alerts?.thresholds ?? [0.8, 1];
                      const crossed = policy.monthlyBudgetUSD === undefined ? [] : thresholds.filter((threshold) => spend / policy.monthlyBudgetUSD! >= threshold && !sent.includes(threshold));
                      await req.frogbot.update({ collection: target.collection as never, id: target.id as never, data: { spendThisPeriodUSD: spend, budgetPeriodStartedAt: doc.budgetPeriodStartedAt ?? new Date().toISOString(), budgetAlertsSent: [...sent, ...crossed] }, overrideAccess: true, req });
                      if (options.alerts && crossed.length) await fetch(options.alerts.webhookURL, { method: 'POST', headers: { 'content-type': 'application/json', ...options.alerts.headers }, body: JSON.stringify({ subject: target, spendThisPeriodUSD: spend, monthlyBudgetUSD: policy.monthlyBudgetUSD, thresholds: crossed }) });
                    })));
                  },
                ],
              },
            },
          }
        : {}),
    };
  };
}

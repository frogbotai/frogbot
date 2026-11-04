import {
  type Access,
  type AccessResult,
  definePlugin,
  type Endpoint,
  type FrogBotConfig,
  type FrogBotRequest,
  type Plugin,
} from 'frogbot';

export type UsageReportGroup = 'apiKey' | 'day' | 'model' | 'user';

export type UsageReportRow = {
  key: string;
  label: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUSD: number;
};

export type UsageReport = {
  groupBy: UsageReportGroup;
  from: string;
  to: string;
  rows: UsageReportRow[];
  totals: Omit<UsageReportRow, 'key' | 'label'>;
};

export type UsageReportsPluginOptions = {
  access?: Access;
  retention?: false | { days: number; cron?: string };
};

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-usage-reports': UsageReportsPluginOptions;
  }
}

type UsageTotals = UsageReport['totals'];

const METRICS = [
  'requestCount',
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'totalTokens',
  'costUSD',
] as const satisfies readonly (keyof UsageTotals)[];

const loggedIn: Access = ({ req }) => Boolean(req.user);

function idAndLabel(value: unknown): { key: string; label: string } | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const key = String(value);

    return { key, label: key };
  }

  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (record.id === undefined) return;
  const key = String(record.id);
  const labelValue = record.name ?? record.email ?? record.title ?? record.id;

  return { key, label: String(labelValue) };
}

function groupValue(value: unknown, groupBy: UsageReportGroup) {
  if (groupBy === 'day') {
    if (typeof value !== 'string') return;
    const key = value.slice(0, 10);

    return { key, label: key };
  }

  if (groupBy === 'model') {
    const key = typeof value === 'string' && value ? value : 'unknown';

    return { key, label: key };
  }

  return idAndLabel(value);
}

function emptyTotals(): UsageTotals {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUSD: 0,
  };
}

function addTotals(target: UsageTotals, source: UsageTotals): void {
  for (const metric of METRICS) target[metric] += source[metric];
}

function parseRequest(req: FrogBotRequest, groups: ReadonlySet<UsageReportGroup>) {
  const search = new URL(req.url ?? '', 'http://localhost').searchParams;
  const groupBy = search.get('groupBy') as UsageReportGroup | null;
  const fromDate = new Date(search.get('from') ?? '');
  const toDate = new Date(search.get('to') ?? '');
  if (
    !groupBy ||
    !groups.has(groupBy) ||
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime()) ||
    fromDate > toDate
  ) {
    return;
  }

  return { groupBy, from: fromDate.toISOString(), to: toDate.toISOString() };
}

type ReportEndpointOptions = {
  slug: string;
  groups: ReadonlySet<UsageReportGroup>;
  access: Access;
};

function buildReportEndpoint({ slug, groups, access }: ReportEndpointOptions): Endpoint {
  return {
    method: 'get',
    path: '/usage/report',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const permitted = await access({ req, slug });
      if (permitted === false) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const scope: Exclude<AccessResult, boolean>[] = permitted === true ? [] : [permitted];
      const query = parseRequest(req, groups);
      if (!query) return Response.json({ error: 'Invalid groupBy or date range' }, { status: 400 });
      const path = query.groupBy === 'day' ? 'requestedAt' : query.groupBy;

      const result = await req.frogbot.aggregate({
        collection: slug,
        groupBy: query.groupBy === 'day' ? { field: 'requestedAt', by: 'day' } : query.groupBy,
        values: {
          requestCount: { count: true },
          inputTokens: { sum: 'inputTokens' },
          outputTokens: { sum: 'outputTokens' },
          cachedInputTokens: { sum: 'cachedInputTokens' },
          cacheWriteTokens: { sum: 'cacheWriteTokens' },
          reasoningTokens: { sum: 'reasoningTokens' },
          totalTokens: { sum: 'totalTokens' },
          costUSD: { sum: 'costUSD' },
        },
        where: {
          and: [
            { requestedAt: { greater_than_equal: query.from } },
            { requestedAt: { less_than_equal: query.to } },
            ...scope,
          ],
        },
        depth: 1,
        overrideAccess: true,
        req,
      });

      const rows = new Map<string, UsageReportRow>();

      for (const { group, values } of result.groups) {
        const value = groupValue(group[path], query.groupBy);
        if (!value) continue;
        const row = rows.get(value.key) ?? { ...value, ...emptyTotals() };
        addTotals(row, values);
        rows.set(value.key, row);
      }

      const reportRows = [...rows.values()].sort(
        (a, b) =>
          b.costUSD - a.costUSD || b.totalTokens - a.totalTokens || a.label.localeCompare(b.label),
      );

      const totals = emptyTotals();

      for (const row of reportRows) addTotals(totals, row);

      return Response.json({
        ...query,
        rows: reportRows,
        totals,
      } satisfies UsageReport);
    },
  };
}

const usageReports = definePlugin<UsageReportsPluginOptions>({
  slug: 'plugin-usage-reports',
  plugin: ({ config, options, plugins }) => {
    if (!config.ai) throw new Error('[plugin-usage-reports] AI configuration is required.');

    const existing = config.collections.find((collection) => collection.usageLog === true);
    const usage = existing ?? { slug: 'usage-logs', usageLog: true as const, fields: [] };
    const collections = existing
      ? config.collections.map((collection) =>
          collection === existing ? { ...collection, admin: { ...collection.admin } } : collection,
        )
      : [...config.collections, { ...usage, admin: {} }];

    const groups = new Set<UsageReportGroup>(['day', 'model', 'user']);
    if (
      plugins['plugin-api-keys'] ||
      usage.fields.some((field) => 'name' in field && field.name === 'apiKey')
    ) {
      groups.add('apiKey');
    }

    const retention = options.retention;
    const task: NonNullable<NonNullable<FrogBotConfig['jobs']>['tasks']>[number] | undefined =
      retention
        ? {
            slug: `frogbot-prune-${usage.slug}`,
            interfaceName: `TaskFrogBot-prune-${usage.slug}`,
            schedule: [{ cron: retention.cron ?? '0 0 * * *', queue: 'default' }],
            handler: async ({ req }) => {
              const cutoff = new Date(Date.now() - retention.days * 86_400_000).toISOString();

              while (true) {
                const { docs } = await req.frogbot.find({
                  collection: usage.slug,
                  where: { requestedAt: { less_than: cutoff } },
                  limit: 100,
                  sort: 'requestedAt',
                  depth: 0,
                  overrideAccess: true,
                  req,
                });

                if (!docs.length) break;

                const { errors } = await req.frogbot.delete({
                  collection: usage.slug,
                  where: { id: { in: docs.map((doc) => doc.id) } },
                  depth: 0,
                  overrideAccess: true,
                  req,
                });

                if (errors.length) throw new Error(errors[0].message);
              }

              return { output: {} };
            },
          }
        : undefined;

    return {
      ...config,
      collections,
      jobs: task ? { ...config.jobs, tasks: [...(config.jobs?.tasks ?? []), task] } : config.jobs,
      endpoints: [
        ...(config.endpoints ?? []),
        buildReportEndpoint({
          slug: usage.slug,
          groups,
          access: options.access ?? loggedIn,
        }),
      ],
      settings: [
        ...(config.settings ?? []),
        {
          label: 'Usage',
          path: 'usage',
          Component: '@frogbotai/plugin-usage-reports/client#UsageReports',
        },
      ],
    };
  },
});

export function usageReportsPlugin(options: UsageReportsPluginOptions = {}): Plugin {
  if (
    options.retention &&
    (!Number.isInteger(options.retention.days) || options.retention.days < 1)
  ) {
    throw new Error('[plugin-usage-reports] retention.days must be a positive integer.');
  }

  return usageReports(options);
}

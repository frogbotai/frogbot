import { importExportPlugin } from '@payloadcms/plugin-import-export';
import type { Endpoint, FrogbotRequest, Plugin } from 'frogbot';

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
  pageSize?: number;
  rawExport?: boolean;
};

const groups = new Set<UsageReportGroup>(['apiKey', 'day', 'model', 'user']);

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

function groupValue(doc: Record<string, unknown>, groupBy: UsageReportGroup) {
  if (groupBy === 'day') {
    const date = new Date(String(doc.requestedAt));
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    return { key, label: key };
  }
  if (groupBy === 'model') {
    const key = typeof doc.model === 'string' && doc.model ? doc.model : 'unknown';
    return { key, label: key };
  }
  return idAndLabel(doc[groupBy]);
}

function number(doc: Record<string, unknown>, field: string): number {
  const value = Number(doc[field] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function emptyRow(key: string, label: string): UsageReportRow {
  return {
    key,
    label,
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

function addDoc(row: UsageReportRow, doc: Record<string, unknown>): void {
  row.requestCount += 1;
  row.inputTokens += number(doc, 'inputTokens');
  row.outputTokens += number(doc, 'outputTokens');
  row.cachedInputTokens += number(doc, 'cachedInputTokens');
  row.cacheWriteTokens += number(doc, 'cacheWriteTokens');
  row.reasoningTokens += number(doc, 'reasoningTokens');
  row.totalTokens += number(doc, 'totalTokens');
  row.costUSD += number(doc, 'costUSD');
}

function parseRequest(req: FrogbotRequest) {
  const search = new URL(req.url ?? '', 'http://localhost').searchParams;
  const groupBy = search.get('groupBy') as UsageReportGroup | null;
  const fromDate = new Date(search.get('from') ?? '');
  const toDate = new Date(search.get('to') ?? '');
  if (!groupBy || !groups.has(groupBy) || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return;
  return { groupBy, from: fromDate.toISOString(), to: toDate.toISOString() };
}

function buildReportEndpoint(slug: string, pageSize: number): Endpoint {
  return {
    method: 'get',
    path: '/usage/report',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const query = parseRequest(req);
      if (!query) return Response.json({ error: 'Invalid groupBy or date range' }, { status: 400 });
      const rows = new Map<string, UsageReportRow>();
      let page = 1;
      while (true) {
        const result = await req.frogbot.find({
          collection: slug as never,
          where: {
            and: [
              { requestedAt: { greater_than_equal: query.from } },
              { requestedAt: { less_than_equal: query.to } },
            ],
          },
          page,
          limit: pageSize,
          depth: 1,
          sort: 'requestedAt',
          overrideAccess: true,
          req,
        });
        for (const value of result.docs) {
          const doc = value as Record<string, unknown>;
          const group = groupValue(doc, query.groupBy);
          if (!group) continue;
          const row = rows.get(group.key) ?? emptyRow(group.key, group.label);
          if (row.label === row.key && group.label !== group.key) row.label = group.label;
          addDoc(row, doc);
          rows.set(group.key, row);
        }
        if (!result.hasNextPage) break;
        page = result.nextPage ?? page + 1;
      }
      const reportRows = [...rows.values()].sort((a, b) => b.costUSD - a.costUSD || b.totalTokens - a.totalTokens || a.label.localeCompare(b.label));
      const totals = emptyRow('', '');
      for (const row of reportRows) {
        totals.requestCount += row.requestCount;
        totals.inputTokens += row.inputTokens;
        totals.outputTokens += row.outputTokens;
        totals.cachedInputTokens += row.cachedInputTokens;
        totals.cacheWriteTokens += row.cacheWriteTokens;
        totals.reasoningTokens += row.reasoningTokens;
        totals.totalTokens += row.totalTokens;
        totals.costUSD += row.costUSD;
      }
      const { key: _key, label: _label, ...reportTotals } = totals;
      return Response.json({ ...query, rows: reportRows, totals: reportTotals } satisfies UsageReport);
    },
  };
}

export function usageReportsPlugin(options: UsageReportsPluginOptions = {}): Plugin {
  const pageSize = options.pageSize ?? 5000;
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('[plugin-usage-reports] pageSize must be a positive integer.');
  return async (config) => {
    if (!config.ai) throw new Error('[plugin-usage-reports] AI configuration is required.');
    const existing = config.collections.find((collection) => collection.usageLog === true);
    const usage = existing ?? { slug: 'usage-logs', usageLog: true as const, fields: [] };
    const collections = existing
      ? config.collections.map((collection) => collection === existing
        ? { ...collection, admin: { ...collection.admin, groupBy: true } }
        : collection)
      : [...config.collections, { ...usage, admin: { groupBy: true } }];
    const next = {
      ...config,
      collections,
      endpoints: [...(config.endpoints ?? []), buildReportEndpoint(usage.slug, pageSize)],
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          afterNavLinks: [
            ...(((config.admin?.components as Record<string, unknown> | undefined)?.afterNavLinks as unknown[] | undefined) ?? []),
            '@frogbotai/plugin-usage-reports/client#UsageReportsNavLink',
          ],
          views: {
            ...(((config.admin?.components as Record<string, unknown> | undefined)?.views as Record<string, unknown> | undefined) ?? {}),
            usageReports: {
              Component: '@frogbotai/plugin-usage-reports/client#UsageReports',
              path: '/usage-analytics',
            },
          },
        },
      },
    };
    if (options.rawExport === false) return next;
    return await importExportPlugin({
      collections: [{ slug: usage.slug, import: false, export: { format: 'csv' } }],
    })(next as never) as unknown as typeof next;
  };
}

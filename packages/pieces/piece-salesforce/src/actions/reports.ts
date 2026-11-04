import { createPieceFile } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from '../client.js';
import { dataRoot, recordId } from '../config.js';
import { defineAction } from '../define.js';
import { recordOptions } from './options.js';

const reportId = recordId('Report');
const reports = recordOptions('Report');

const columnInfo = z.record(z.string(), z.object({ label: z.string() })).optional();

const cell = z.object({ label: z.unknown().optional(), value: z.unknown().optional() });

const grouping: z.ZodType<{ key: string; label: string; groupings?: unknown[] }> = z.lazy(() =>
  z.object({ key: z.string(), label: z.string(), groupings: z.array(grouping).optional() }),
);

const reportResult = z.object({
  attributes: z.object({ reportId: z.string(), reportName: z.string().optional() }),
  reportMetadata: z.object({
    name: z.string().optional(),
    detailColumns: z.array(z.string()).default([]),
    groupingsDown: z.array(z.object({ name: z.string() })).default([]),
  }),
  reportExtendedMetadata: z
    .object({ detailColumnInfo: columnInfo, groupingColumnInfo: columnInfo })
    .default({}),
  factMap: z
    .record(
      z.string(),
      z.object({ rows: z.array(z.object({ dataCells: z.array(cell) })).optional() }),
    )
    .default({}),
  groupingsDown: z.object({ groupings: z.array(grouping).default([]) }).optional(),
});

type ReportResult = z.output<typeof reportResult>;

function groupLabels(groupings: { key: string; label: string; groupings?: unknown[] }[]) {
  const labels = new Map<string, string>();

  for (const entry of groupings) {
    labels.set(entry.key, entry.label);

    for (const [key, label] of groupLabels(
      (entry.groupings ?? []) as { key: string; label: string }[],
    )) {
      labels.set(key, label);
    }
  }

  return labels;
}

function reportRows(report: ReportResult) {
  const { detailColumns, groupingsDown } = report.reportMetadata;
  const { detailColumnInfo = {}, groupingColumnInfo = {} } = report.reportExtendedMetadata;
  const columns = detailColumns.map((column) => detailColumnInfo[column]?.label ?? column);
  const groups = groupingsDown.map((group) => groupingColumnInfo[group.name]?.label ?? group.name);
  const groupValues = groupLabels(report.groupingsDown?.groupings ?? []);
  const rows: Record<string, unknown>[] = [];

  for (const [key, fact] of Object.entries(report.factMap)) {
    const [rowKey = 'T'] = key.split('!');
    const context: Record<string, unknown> = {};

    if (rowKey !== 'T') {
      rowKey.split('_').forEach((_, depth, parts) => {
        const label = groupValues.get(parts.slice(0, depth + 1).join('_'));

        if (label !== undefined) context[groups[depth] ?? `Group ${depth}`] = label;
      });
    }

    for (const row of fact.rows ?? []) {
      const values = row.dataCells.map((entry, index) => {
        const value = entry.label ?? entry.value;

        return [columns[index] ?? `Column ${index}`, value === '-' || value === '--' ? '' : value];
      });

      rows.push({ ...context, ...Object.fromEntries(values) });
    }
  }

  return {
    reportId: report.attributes.reportId,
    reportName:
      report.attributes.reportName ?? report.reportMetadata.name ?? report.attributes.reportId,
    columns: [...groups, ...columns],
    rows,
  };
}

const filter = z.object({
  column: z.string().meta({ description: 'The column API name, such as ACCOUNT.NAME.' }),
  operator: z.string().meta({ description: 'Such as equals, notEqual, lessThan or contains.' }),
  value: z.string(),
});

export const runReport = defineAction({
  slug: 'runReport',
  description:
    "Run a report and return its rows, one object per row keyed by column label, with each row's grouping values. Up to 2,000 rows.",
  input: z.object({
    reportId,
    filters: z.array(filter).optional().meta({
      label: 'Filters',
      description: "Replace the report's saved filters for this run.",
    }),
  }),
  output: z.object({
    reportId: z.string(),
    reportName: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.unknown())),
  }),
  idempotent: true,
  options: { reportId: reports },
  async run({ client, input, req }) {
    const filtered = input.filters?.length;
    const report = await client.request(reportResult, {
      method: filtered ? 'POST' : 'GET',
      path: `${dataRoot}/analytics/reports/${input.reportId}`,
      query: { includeDetails: true },
      body: filtered ? { reportMetadata: { reportFilters: input.filters } } : undefined,
      signal: signal(req),
    });

    return reportRows(report);
  },
});

const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const exportReport = defineAction({
  slug: 'exportReport',
  description: 'Run a report and save it as an Excel file in the files collection.',
  input: z.object({ reportId }),
  output: z.object({
    fileId: z.union([z.string(), z.number()]),
    name: z.string(),
    size: z.number(),
    url: z.string().nullable(),
  }),
  idempotent: false,
  options: { reportId: reports },
  async run({ client, input, req, overrideAccess }) {
    const described = await client.request(
      z.object({ reportMetadata: z.object({ name: z.string().optional() }) }),
      { path: `${dataRoot}/analytics/reports/${input.reportId}/describe`, signal: signal(req) },
    );

    const response = await client.send({
      path: `${dataRoot}/analytics/reports/${input.reportId}`,
      headers: { accept: xlsx },
      signal: signal(req),
    });

    const data = Buffer.from(await response.arrayBuffer());
    const name = `${(described.reportMetadata.name ?? input.reportId).replace(/[\\/:*?"<>|]/g, '_')}.xlsx`;

    req.signal?.throwIfAborted();

    const doc = await createPieceFile(req, 'Salesforce', {
      file: { data, mimetype: xlsx, name, size: data.length },
      req,
      overrideAccess,
    });

    return {
      fileId: doc.id,
      name,
      size: data.length,
      url: typeof doc.url === 'string' ? doc.url : null,
    };
  },
});

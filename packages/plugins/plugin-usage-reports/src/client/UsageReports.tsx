'use client';

import { useConfig } from '@payloadcms/ui';
import { useEffect, useState } from 'react';

import type { UsageReport, UsageReportGroup, UsageReportRow } from '../index.js';
import './styles.css';

type DateRange = { from: string; to: string; label: string };
type SortField = keyof Pick<UsageReportRow, 'label' | 'requestCount' | 'totalTokens' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'reasoningTokens' | 'costUSD'>;

const presets = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function rangeForDays(days: number, label: string): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString(), to: to.toISOString(), label };
}

function dateInput(value: string): string {
  return value.slice(0, 10);
}

function customRange(from: string, to: string): DateRange {
  return {
    from: new Date(`${from}T00:00:00.000Z`).toISOString(),
    to: new Date(`${to}T23:59:59.999Z`).toISOString(),
    label: `${from} - ${to}`,
  };
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function UsageReportsNavLink() {
  const { config } = useConfig();
  return <a className="usage-reports-nav-link" href={`${config.routes.admin}/usage-analytics`}>Usage Analytics</a>;
}

export function UsageReports() {
  const { config } = useConfig();
  const [groupBy, setGroupBy] = useState<Extract<UsageReportGroup, 'model' | 'user'>>('model');
  const [range, setRange] = useState<DateRange>(() => rangeForDays(30, 'Last 30 days'));
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(dateInput(range.from));
  const [customTo, setCustomTo] = useState(dateInput(range.to));
  const [report, setReport] = useState<UsageReport>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>(groupBy === 'model' ? 'totalTokens' : 'costUSD');
  const [ascending, setAscending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ groupBy, from: range.from, to: range.to });
    setLoading(true);
    setError(undefined);
    fetch(`${config.routes.api}/usage/report?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setReport(await response.json() as UsageReport);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load usage report');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [config.routes.api, groupBy, range]);

  const rows = [...(report?.rows ?? [])].sort((a, b) => {
    const left = a[sortField];
    const right = b[sortField];
    const result = typeof left === 'string'
      ? left.localeCompare(String(right))
      : left - Number(right);
    return ascending ? result : -result;
  });
  const columns: Array<{ field: SortField; label: string; value: (row: UsageReportRow) => string }> = [
    { field: 'label', label: groupBy === 'model' ? 'Model' : 'User', value: (row) => row.label },
    { field: 'requestCount', label: 'Requests', value: (row) => row.requestCount.toLocaleString() },
    { field: 'totalTokens', label: 'Total Tokens', value: (row) => formatTokens(row.totalTokens) },
    { field: 'inputTokens', label: 'Input', value: (row) => formatTokens(row.inputTokens) },
    { field: 'outputTokens', label: 'Output', value: (row) => formatTokens(row.outputTokens) },
    { field: 'cachedInputTokens', label: 'Cached', value: (row) => formatTokens(row.cachedInputTokens) },
    { field: 'reasoningTokens', label: 'Reasoning', value: (row) => formatTokens(row.reasoningTokens) },
    { field: 'costUSD', label: 'Cost', value: (row) => `$${row.costUSD.toFixed(2)}` },
  ];

  function sort(field: SortField) {
    if (sortField === field) setAscending(!ascending);
    else {
      setSortField(field);
      setAscending(false);
    }
  }

  return (
    <div className="usage-reports">
      <header className="usage-reports__header">
        <div>
          <h1>Usage Analytics</h1>
          <p>{range.label}</p>
        </div>
        <div className="usage-reports__ranges">
          {presets.map((preset) => <button key={preset.days} type="button" onClick={() => { setShowCustom(false); setRange(rangeForDays(preset.days, preset.label)); }}>{preset.label}</button>)}
          <button type="button" onClick={() => setShowCustom(!showCustom)}>Custom</button>
        </div>
      </header>
      {showCustom && <div className="usage-reports__custom">
        <label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
        <label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
        <button type="button" disabled={!customFrom || !customTo || customFrom > customTo} onClick={() => { setRange(customRange(customFrom, customTo)); setShowCustom(false); }}>Apply</button>
      </div>}
      <nav className="usage-reports__tabs" aria-label="Usage report">
        {(['model', 'user'] as const).map((group) => <button className={groupBy === group ? 'active' : ''} key={group} type="button" onClick={() => { setGroupBy(group); setSortField(group === 'model' ? 'totalTokens' : 'costUSD'); setAscending(false); }}>{group === 'model' ? 'Models' : 'Users'}</button>)}
      </nav>
      <section className="usage-reports__card">
        <div className="usage-reports__totals">
          <span><strong>{report?.totals.requestCount.toLocaleString() ?? '0'}</strong> requests</span>
          <span><strong>{formatTokens(report?.totals.totalTokens ?? 0)}</strong> tokens</span>
          <span><strong>${(report?.totals.costUSD ?? 0).toFixed(2)}</strong> cost</span>
        </div>
        {loading && <p className="usage-reports__state">Loading usage...</p>}
        {error && <p className="usage-reports__state usage-reports__error">Failed to load: {error}</p>}
        {!loading && !error && rows.length === 0 && <p className="usage-reports__state">No usage in this date range.</p>}
        {!loading && !error && rows.length > 0 && <div className="usage-reports__table-wrap"><table>
          <thead><tr>{columns.map((column) => <th key={column.field}><button type="button" onClick={() => sort(column.field)}>{column.label}{sortField === column.field ? (ascending ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.key}>{columns.map((column) => <td key={column.field}>{column.value(row)}</td>)}</tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  );
}

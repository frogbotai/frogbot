import { HorizontalSeparatorWithText } from '../components/separator.js';
import LoadingIcon from '../icons/icons/LoadingIcon.js';
import { DataPartJson, type DataPartValue } from './data-part.js';
import { Markdown } from './markdown.js';

export type CompactionPartData = {
  status: 'running' | 'completed' | 'failed';
  reason: 'auto' | 'manual';
  summary?: string;
  error?: string;
  tokens?: { input: number; output: number };
};

const STATUSES = new Set(['running', 'completed', 'failed']);
const REASONS = new Set(['auto', 'manual']);

function isCompactionPartData(data: unknown): data is CompactionPartData {
  if (typeof data !== 'object' || data === null) return false;

  const { error, reason, status, summary, tokens } = data as Record<string, unknown>;

  return (
    typeof status === 'string' &&
    STATUSES.has(status) &&
    typeof reason === 'string' &&
    REASONS.has(reason) &&
    (summary === undefined || typeof summary === 'string') &&
    (error === undefined || typeof error === 'string') &&
    (tokens === undefined ||
      (typeof tokens === 'object' &&
        tokens !== null &&
        typeof (tokens as Record<string, unknown>).input === 'number' &&
        typeof (tokens as Record<string, unknown>).output === 'number'))
  );
}

function usage(tokens: CompactionPartData['tokens']) {
  if (!tokens || tokens.input + tokens.output <= 0) return undefined;

  const compact = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  return `${compact.format(tokens.input)} in · ${compact.format(tokens.output)} out`;
}

export function CompactionPart({ part }: { part: DataPartValue }) {
  if (!isCompactionPartData(part.data)) return <DataPartJson part={part} />;

  const { error, status, summary, tokens } = part.data;
  const label =
    status === 'failed'
      ? 'Compaction failed'
      : status === 'completed'
        ? ['Chat compacted', usage(tokens)].filter(Boolean).join(' · ')
        : undefined;

  return (
    <div data-part="compaction" data-state={status} className="fb-compaction">
      <HorizontalSeparatorWithText className="fb-compaction__divider">
        Compaction started
      </HorizontalSeparatorWithText>
      {status !== 'failed' && summary !== undefined && summary.trim() !== '' && (
        <div className="fb-compaction__summary">
          <Markdown>{summary}</Markdown>
        </div>
      )}
      {status === 'running' && (
        <div role="status" className="fb-compaction__running">
          <LoadingIcon className="fb-compaction__spinner" />
          Compacting…
        </div>
      )}
      {label && (
        <HorizontalSeparatorWithText className="fb-compaction__divider">
          {label}
        </HorizontalSeparatorWithText>
      )}
      {status === 'failed' && error !== undefined && error !== '' && (
        <p className="fb-compaction__error">{error}</p>
      )}
    </div>
  );
}

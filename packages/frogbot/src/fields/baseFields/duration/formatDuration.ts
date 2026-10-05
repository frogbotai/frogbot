export type DurationFormat = 'h:mm' | 'h:mm:ss';

export type DurationKind = {
  type: 'duration';
  format: DurationFormat;
};

export type FormatDurationArgs = {
  value: unknown;
  format?: DurationFormat;
};

export type ParseDurationArgs = {
  text: string;
  format?: DurationFormat;
};

const units: Record<DurationFormat, number[]> = {
  'h:mm': [60, 3600],
  'h:mm:ss': [1, 60, 3600],
};

function pad(part: number): string {
  return String(part).padStart(2, '0');
}

export function formatDuration({ format = 'h:mm:ss', value }: FormatDurationArgs): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  const unit = units[format][0];
  const seconds = Math.ceil(Math.abs(value) / unit) * unit;
  const sign = value < 0 && seconds > 0 ? '-' : '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (format === 'h:mm') return `${sign}${hours}:${pad(minutes)}`;

  if (hours === 0) return `${sign}${minutes}:${pad(seconds % 60)}`;

  return `${sign}${hours}:${pad(minutes)}:${pad(seconds % 60)}`;
}

export function parseDuration({
  format = 'h:mm:ss',
  text,
}: ParseDurationArgs): number | null | undefined {
  const trimmed = text.trim();

  if (trimmed === '') return null;

  const formatUnits = units[format];
  const pattern = new RegExp(`^(-?)(\\d+(?::\\d{1,2}){0,${formatUnits.length - 1}})$`);
  const match = pattern.exec(trimmed);

  if (!match) return undefined;

  const parts = match[2].split(':').map(Number);

  if (parts.slice(1).some((part) => part > 59)) return undefined;

  const total = parts.reverse().reduce((sum, part, index) => sum + part * formatUnits[index], 0);

  if (!Number.isSafeInteger(total)) return undefined;

  return match[1] && total !== 0 ? -total : total;
}

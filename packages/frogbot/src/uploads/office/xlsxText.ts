import { formatCount } from './limitText.js';
import { checkSheetSize } from './sheetGuard.js';
import { OfficeFileError } from './zipGuard.js';

type XlsxCell = string | boolean | Date | null;

type XlsxSheet = {
  sheet: string;
  data: XlsxCell[][];
};

type XlsxResult = {
  sheet: string;
  data?: XlsxCell[][];
};

const MAX_ROWS = 1_000;

const CSV_SPECIAL = /[",\r\n]/;

const DAY_MS = 86_400_000;

const UNIX_EPOCH_SERIAL = 25_569;

const MAX_YEAR = 9_999;

function serialNumber(date: Date): string {
  const time = date.getTime();

  return Number.isNaN(time) ? '' : String(time / DAY_MS + UNIX_EPOCH_SERIAL);
}

function formatDate(date: Date): string {
  const seconds = new Date(Math.round(date.getTime() / 1000) * 1000);
  const year = seconds.getUTCFullYear();

  if (!(year >= 0 && year <= MAX_YEAR)) return serialNumber(date);

  const [day, time] = seconds.toISOString().split(/[T.]/);

  return time === '00:00:00' ? day : `${day} ${time}`;
}

function formatCell(value: XlsxCell): string {
  if (value === null) return '';

  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  if (value instanceof Date) return formatDate(value);

  return value;
}

function csvField(value: string): string {
  return CSV_SPECIAL.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function worksheets(results: XlsxResult[]): XlsxSheet[] {
  const sheets = results.filter((result): result is XlsxSheet => Array.isArray(result.data));

  if (new Set(sheets.map(({ data }) => data)).size < sheets.length) {
    throw new OfficeFileError('invalid');
  }

  return sheets;
}

function sheetText({ filename, sheet, data }: XlsxSheet & { filename: string }): string {
  const lines = data
    .slice(0, MAX_ROWS)
    .map((row) => row.map((cell) => csvField(formatCell(cell))).join(','));

  if (data.length > MAX_ROWS) {
    lines.push(
      `[${filename}: showing the first ${formatCount(MAX_ROWS)} of ${formatCount(data.length)} rows of sheet ${sheet}]`,
    );
  }

  return [`Sheet "${sheet}":`, ...lines].join('\n');
}

export async function xlsxText({
  bytes,
  filename,
}: {
  bytes: Uint8Array;
  filename: string;
}): Promise<string> {
  await checkSheetSize(bytes);

  const { default: readXlsxFile } = await import('read-excel-file/universal');

  const results = await readXlsxFile(new Uint8Array(bytes).buffer, {
    parseNumber: (value) => value,
  }).catch((error: unknown) => {
    throw new OfficeFileError('invalid', { cause: error });
  });

  return worksheets(results as XlsxResult[])
    .filter(({ data }) => data.length > 0)
    .map((sheet) => sheetText({ filename, ...sheet }))
    .join('\n\n');
}

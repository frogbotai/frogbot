import { parse } from 'csv-parse/sync';

export type ImportFormat = 'csv' | 'json';

/** The headers of an import file and the first few values of each column. */
export type ImportFileColumns = {
  headers: string[];
  samples: Record<string, unknown[]>;
};

const sampleSize = 3;

const sampleRows = 100;

/**
 * Reads the headers and up to 3 sample values per column, parsing a CSV the way Payload's import
 * does (`csv-parse`, trimmed, empty lines skipped) so the headers match what the import sees.
 */
export function readImportFile(data: Buffer, format: ImportFormat): ImportFileColumns {
  return format === 'csv' ? readCSV(data) : readJSON(data);
}

function readCSV(data: Buffer): ImportFileColumns {
  let headers: string[] = [];

  const rows = parse(data, {
    bom: true,
    cast: (value, context) => (context.header ? value : castCell(value)),
    columns: (header: string[]) => {
      headers = header;

      return header;
    },
    skip_empty_lines: true,
    to: sampleRows,
    trim: true,
  }) as Record<string, unknown>[];

  return { headers, samples: collectSamples(headers, rows) };
}

function readJSON(data: Buffer): ImportFileColumns {
  const parsed: unknown = JSON.parse(data.toString('utf8'));

  if (!Array.isArray(parsed)) throw new Error('A JSON import must be an array of objects.');

  const rows = parsed
    .slice(0, sampleRows)
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return { headers, samples: collectSamples(headers, rows) };
}

function collectSamples(headers: string[], rows: Record<string, unknown>[]) {
  return Object.fromEntries(
    headers.map((header) => [
      header,
      rows
        .map((row) => row[header])
        .filter((value) => value !== undefined && value !== null && value !== '')
        .slice(0, sampleSize),
    ]),
  );
}

function castCell(value: string): unknown {
  if (value === '') return undefined;

  if (value === 'true') return true;

  if (value === 'false') return false;

  if (value === 'null' || value === 'NULL') return null;

  if (value.includes(',')) return value;

  const number = Number(value);

  if (!Number.isNaN(number) && (String(number) === value || value.includes('.'))) return number;

  return value;
}

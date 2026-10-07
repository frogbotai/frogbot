import { type Entry, fromBufferPromise, type ZipFile } from 'yauzl';

import { entryName, OfficeFileError } from './zipGuard.js';

type CellAddress = {
  row: number;
  column: number;
};

type SheetExtent = {
  rows: number;
  columns: number;
};

const MAX_SHEET_CELLS = 20_000_000;

const ROW_CELLS = 16;

const WORKBOOK_RELATIONSHIPS = 'xl/_rels/workbook.xml.rels';

const TARGET = /(?=\s(?:([\w.-]*):)?Target=(?:"([^"]*)"|'([^']*)'))/g;

const SHEET_TOKEN = /(?=<(?:[\w.-]*:)?(row)[\s/>]|\s(?:([\w.-]*):)?r=(?:"([^"]*)"|'([^']*)'))/g;

const ENTITY = /&#(\d+);|&#x([0-9a-f]+);|&(\w+);/gi;

const ENTITIES = new Map(
  Object.entries({ amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }).flatMap(
    ([name, character]) => [
      [name, character],
      [name.toUpperCase(), character],
    ],
  ),
);

const utf8 = new TextDecoder();

function decode(value: string): string {
  return value.replace(
    ENTITY,
    // eslint-disable-next-line @typescript-eslint/max-params -- String.prototype.replace callback signature
    (entity: string, decimal: string | undefined, hex: string, name: string | undefined) => {
      if (name) return ENTITIES.get(name) ?? entity;

      return String.fromCharCode(decimal ? Number(decimal) : parseInt(hex, 16));
    },
  );
}

async function readEntry({ zip, entry }: { zip: ZipFile; entry: Entry }): Promise<string> {
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];

  for await (const chunk of stream) chunks.push(chunk as Buffer);

  return utf8.decode(Buffer.concat(chunks));
}

function sheetPaths(relationships: string): string[] {
  return [...relationships.matchAll(TARGET)]
    .filter(([, prefix]) => prefix !== 'xmlns')
    .map(([, , double, single]) => decode(double ?? single))
    .map((target) => (target.startsWith('/') ? target.slice(1) : `xl/${target}`));
}

function cellAddress(value: string): CellAddress | undefined {
  let column = 0;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    if (code >= 48 && code <= 57) {
      const row = Number(value.slice(index));

      return Number.isNaN(row) ? undefined : { row, column };
    }

    column = column * 26 + code - 64;
  }

  return undefined;
}

function sheetExtent(xml: string): SheetExtent {
  let rows = 0;
  let rowTags = 0;
  let columns = 0;

  for (const [, row, prefix, double, single] of xml.matchAll(SHEET_TOKEN)) {
    if (row) {
      rowTags += 1;

      continue;
    }

    if (prefix === 'xmlns') continue;

    const value = decode(double ?? single);
    const cell = cellAddress(value);

    rows = Math.max(rows, Number(value) || 0, cell?.row ?? 0);
    columns = Math.max(columns, cell?.column ?? 0);
  }

  return { rows: rows + rowTags, columns };
}

async function checkSheets(zip: ZipFile): Promise<void> {
  const entries: Entry[] = [];

  for await (const entry of zip.eachEntry()) entries.push(entry);

  const paths = new Set<string>();

  for (const entry of entries) {
    if (entryName(entry) !== WORKBOOK_RELATIONSHIPS) continue;

    sheetPaths(await readEntry({ zip, entry })).forEach((path) => paths.add(path));
  }

  let cells = 0;

  for (const entry of entries) {
    if (!paths.has(entryName(entry))) continue;

    const { rows, columns } = sheetExtent(await readEntry({ zip, entry }));

    cells += Math.max(rows, 1) * (columns + ROW_CELLS);

    if (cells > MAX_SHEET_CELLS) throw new OfficeFileError('too-large');
  }
}

export async function checkSheetSize(bytes: Uint8Array): Promise<void> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const zip = await fromBufferPromise(buffer, { decodeStrings: false }).catch((error: unknown) => {
    throw new OfficeFileError('invalid', { cause: error });
  });

  try {
    await checkSheets(zip);
  } catch (error) {
    if (error instanceof OfficeFileError) throw error;

    throw new OfficeFileError('invalid', { cause: error });
  } finally {
    zip.close();
  }
}

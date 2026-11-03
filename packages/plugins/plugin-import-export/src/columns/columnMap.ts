import type { Field, FieldHook } from 'payload';

/** One file column and the field it imports into. */
export type ImportColumn = {
  /** The header in the file, exactly as written. */
  header: string;
  /** The target field's path, such as `name` or `address.city`, or `null` to skip the column. */
  field: string | null;
  /** For a relationship, the related collection's field the cell is matched against. */
  matchBy?: string;
  /** For a relationship, create the related record when no record matches. */
  createMissing?: boolean;
};

/** The column mapping stored on an import. */
export type ImportColumnMap = {
  headers: string[];
  columns: ImportColumn[];
};

export const columnMapFieldName = 'columnMap';

export const headerKeyFieldName = 'headerKey';

/** Identifies a header set regardless of order, so a later import can reuse its mapping. */
export function toHeaderKey(headers: string[]): string {
  return JSON.stringify(headers.map((header) => header.trim()).sort());
}

/** Reads a stored or submitted mapping, or `undefined` when there is none or it is malformed. */
export function readColumnMap(value: unknown): ImportColumnMap | undefined {
  const parsed = typeof value === 'string' ? parseJSON(value) : value;

  if (!isRecord(parsed) || !Array.isArray(parsed.columns)) return undefined;

  const columns = parsed.columns.filter(isColumn);

  const headers = Array.isArray(parsed.headers)
    ? parsed.headers.filter((header): header is string => typeof header === 'string')
    : columns.map(({ header }) => header);

  return { headers, columns };
}

const writeHeaderKey: FieldHook = ({ siblingData }) => {
  const columnMap = readColumnMap(siblingData[columnMapFieldName]);

  return columnMap ? toHeaderKey(columnMap.headers) : undefined;
};

/** Props the Columns field component receives from the config. */
export type ImportColumnsFieldClientProps = {
  /** Shows **Suggest with AI**; set when an AI model is configured. */
  ai: boolean;
};

export const importColumnsFieldPath = '@frogbotai/plugin-import-export/client#ImportColumnsField';

/** The `columnMap` field, edited by the Columns component, and its hidden `headerKey`. */
export function columnMapFields({ ai }: ImportColumnsFieldClientProps): Field[] {
  return [
    {
      name: columnMapFieldName,
      type: 'json',
      label: 'Columns',
      admin: {
        components: {
          Field: {
            path: importColumnsFieldPath,
            clientProps: { ai } satisfies ImportColumnsFieldClientProps,
          },
        },
      },
    },
    {
      name: headerKeyFieldName,
      type: 'text',
      index: true,
      admin: { hidden: true },
      hooks: { beforeChange: [writeHeaderKey] },
    },
  ];
}

function isColumn(value: unknown): value is ImportColumn {
  return (
    isRecord(value) &&
    typeof value.header === 'string' &&
    (value.field === null || typeof value.field === 'string') &&
    (value.matchBy === undefined || typeof value.matchBy === 'string') &&
    (value.createMissing === undefined || typeof value.createMissing === 'boolean')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJSON(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

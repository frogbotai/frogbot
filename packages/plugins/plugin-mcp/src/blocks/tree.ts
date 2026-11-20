import type {
  FlattenedBlock,
  FlattenedBlocksField,
  FlattenedField,
  SanitizedConfig,
} from 'payload';

export type BlockData = Record<string, unknown> & { blockType: string; id?: number | string };

/** One blocks field in a document: where it is, its schema and its rows. */
export type BlockList = {
  path: string;
  field: FlattenedBlocksField;
  rows: BlockData[];
};

/** Where a block sits: its list and its index in that list. */
export type BlockSpot = { list: BlockList; index: number };

type Container = Record<string, unknown>;

const TITLE_LENGTH = 80;

export function isRecord(value: unknown): value is Container {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The blocks a field accepts, with `config.blocks` references resolved. */
export function fieldBlocks(
  field: FlattenedBlocksField,
  config: SanitizedConfig,
): FlattenedBlock[] {
  return field.blocks.flatMap((block) => {
    if (typeof block !== 'string') return [block];

    const found = config.blocks?.find(({ slug }) => slug === block);

    return found ? [found] : [];
  });
}

/** Every blocks field in the document, nested ones included, in document order. */
export function collectBlockLists(
  doc: Container,
  fields: FlattenedField[],
  config: SanitizedConfig,
): BlockList[] {
  const lists: BlockList[] = [];

  walk(doc, fields, '', config, lists);

  return lists;
}

function walk(
  container: Container,
  fields: FlattenedField[],
  prefix: string,
  config: SanitizedConfig,
  lists: BlockList[],
): void {
  for (const field of fields) {
    const value = container[field.name];
    const path = `${prefix}${field.name}`;

    if (field.type === 'blocks') {
      const rows: BlockData[] = Array.isArray(value) ? value : [];

      lists.push({ path, field, rows });

      const blocks = fieldBlocks(field, config);

      rows.forEach((row, index) => {
        const block = isBlock(row) && blocks.find(({ slug }) => slug === row.blockType);

        if (block) walk(row, block.flattenedFields, `${path}.${index}.`, config, lists);
      });
    } else if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((row: unknown, index) => {
        if (isRecord(row)) walk(row, field.flattenedFields, `${path}.${index}.`, config, lists);
      });
    } else if (field.type === 'group' || field.type === 'tab') {
      walk(isRecord(value) ? value : {}, field.flattenedFields, `${path}.`, config, lists);
    }
  }
}

/** Whether the fields hold a blocks field, at any depth outside blocks. */
export function hasBlocksField(fields: FlattenedField[]): boolean {
  return fields.some(
    (field) =>
      field.type === 'blocks' ||
      ((field.type === 'group' || field.type === 'tab' || field.type === 'array') &&
        hasBlocksField(field.flattenedFields)),
  );
}

function isBlock(value: unknown): value is BlockData {
  return isRecord(value) && typeof value.blockType === 'string';
}

/** Finds a block by its id anywhere in the document. */
export function findBlock(lists: BlockList[], blockId: number | string): BlockSpot {
  const spots = lists.flatMap((list) =>
    list.rows.flatMap((row, index) =>
      String(row.id) === String(blockId) ? [{ list, index }] : [],
    ),
  );

  const [spot] = spots;

  if (!spot) {
    throw new Error(`No block has the id '${blockId}'. Call listBlocks to see the block ids.`);
  }

  if (spots.length > 1) {
    throw new Error(`More than one block has the id '${blockId}'.`);
  }

  return spot;
}

/**
 * Finds the blocks field at a dot path such as `layout` or `layout.2.columns`, creating its empty
 * array, and any group it sits in, when the document has no value there yet.
 */
export function resolveBlockList(
  doc: Container,
  fields: FlattenedField[],
  path: string,
  config: SanitizedConfig,
): BlockList {
  const segments = path.split('.');
  const notFound = new Error(
    `'${path}' is not a blocks field. Call listBlocks to see the fields' paths.`,
  );

  let container = doc;
  let current = fields;

  for (let i = 0; i < segments.length; i++) {
    const field = current.find(({ name }) => name === segments[i]);
    const last = i === segments.length - 1;

    if (!field) throw notFound;

    if (field.type === 'blocks') {
      if (!Array.isArray(container[field.name])) container[field.name] = [];

      const rows = container[field.name] as BlockData[];

      if (last) return { path, field, rows };

      const row = rows[Number(segments[++i])];
      const block = row && fieldBlocks(field, config).find(({ slug }) => slug === row.blockType);

      if (!block || !/^\d+$/.test(segments[i] ?? '')) throw notFound;

      container = row;
      current = block.flattenedFields;
    } else if (field.type === 'array' && !last) {
      const row: unknown = Array.isArray(container[field.name])
        ? (container[field.name] as unknown[])[Number(segments[++i])]
        : undefined;

      if (!isRecord(row) || !/^\d+$/.test(segments[i] ?? '')) throw notFound;

      container = row;
      current = field.flattenedFields;
    } else if ((field.type === 'group' || field.type === 'tab') && !last) {
      if (!isRecord(container[field.name])) container[field.name] = {};

      container = container[field.name] as Container;
      current = field.flattenedFields;
    } else {
      throw notFound;
    }
  }

  throw notFound;
}

/** A short label for a block: its `blockName`, else its first text field with a value. */
export function blockTitle(row: BlockData, block: FlattenedBlock | undefined): string | undefined {
  const named = typeof row.blockName === 'string' && row.blockName.trim() ? row.blockName : null;

  const text =
    named ??
    block?.flattenedFields
      .filter(({ name, type }) => name !== 'id' && (type === 'text' || type === 'textarea'))
      .map(({ name }) => row[name])
      .find((value): value is string => typeof value === 'string' && value.trim() !== '');

  if (!text) return undefined;

  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1)}…` : text;
}

/**
 * Merges a patch into a block or group: a group field merges key by key, any other field's value is
 * replaced whole.
 */
export function mergePatch(
  target: Container,
  patch: Container,
  fields: FlattenedField[],
): Container {
  const merged: Container = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    const field = fields.find(({ name }) => name === key);
    const current = target[key];

    merged[key] =
      field &&
      (field.type === 'group' || field.type === 'tab') &&
      isRecord(value) &&
      isRecord(current)
        ? mergePatch(current, value, field.flattenedFields)
        : value;
  }

  return merged;
}

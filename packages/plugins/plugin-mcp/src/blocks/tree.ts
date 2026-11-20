import type {
  FlattenedBlock,
  FlattenedBlocksField,
  FlattenedField,
  SanitizedConfig,
} from 'payload';

export type BlockData = Record<string, unknown> & { blockType: string; id?: number | string };

/** A field on the way to a blocks field, with the data around it, for checking its access. */
export type FieldLink = {
  field: FlattenedField;
  siblingData: Container;
  blockData: Container | undefined;
};

/**
 * One blocks field in a document: where it is, its schema, its rows, and every field from the
 * document's top down to it, itself included.
 */
export type BlockList = {
  path: string;
  field: FlattenedBlocksField;
  rows: BlockData[];
  chain: FieldLink[];
};

/** Where a block sits: its list and its index in that list. */
export type BlockSpot = { list: BlockList; index: number };

type Container = Record<string, unknown>;

const TITLE_LENGTH = 80;
const INDEX = /^(0|[1-9]\d*)$/;

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

  walk({ container: doc, fields, prefix: '', config, lists, chain: [], blockData: undefined });

  return lists;
}

function walk({
  container,
  fields,
  prefix,
  config,
  lists,
  chain,
  blockData,
}: {
  container: Container;
  fields: FlattenedField[];
  prefix: string;
  config: SanitizedConfig;
  lists: BlockList[];
  chain: FieldLink[];
  blockData: Container | undefined;
}): void {
  for (const field of fields) {
    const value = container[field.name];
    const path = `${prefix}${field.name}`;
    const down = [...chain, { field, siblingData: container, blockData }];
    const next = { config, lists, chain: down, blockData };

    if (field.type === 'blocks') {
      const rows: BlockData[] = Array.isArray(value) ? value : [];

      lists.push({ path, field, rows, chain: down });

      const blocks = fieldBlocks(field, config);

      rows.forEach((row, index) => {
        const block = isBlock(row) && blocks.find(({ slug }) => slug === row.blockType);

        if (block) {
          walk({
            ...next,
            container: row,
            fields: block.flattenedFields,
            prefix: `${path}.${index}.`,
            blockData: row,
          });
        }
      });
    } else if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((row: unknown, index) => {
        if (isRecord(row)) {
          walk({
            ...next,
            container: row,
            fields: field.flattenedFields,
            prefix: `${path}.${index}.`,
          });
        }
      });
    } else if (field.type === 'group' || field.type === 'tab') {
      walk({
        ...next,
        container: isRecord(value) ? value : {},
        fields: field.flattenedFields,
        prefix: `${path}.`,
      });
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

/** Every place a block with this id sits in the document. */
export function blockSpots(lists: BlockList[], blockId: number | string): BlockSpot[] {
  return lists.flatMap((list) =>
    list.rows.flatMap((row, index) =>
      String(row.id) === String(blockId) ? [{ list, index }] : [],
    ),
  );
}

/** Finds a block by its id anywhere in the document. */
export function findBlock(lists: BlockList[], blockId: number | string): BlockSpot {
  const spots = blockSpots(lists, blockId);
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
 * The fields in a block, nested ones included, whose values Payload keeps only while the block
 * stays in the same blocks field: those with their own update access, and localized ones.
 */
export function rowBoundFields(
  row: BlockData,
  block: FlattenedBlock,
  config: SanitizedConfig,
): { guarded: string[]; localized: string[] } {
  const found = { guarded: [] as string[], localized: [] as string[] };

  scan(row, block.flattenedFields, '', config, found);

  return found;
}

function scan(
  value: unknown,
  fields: FlattenedField[],
  prefix: string,
  config: SanitizedConfig,
  found: { guarded: string[]; localized: string[] },
): void {
  if (!isRecord(value)) return;

  for (const field of fields) {
    const path = `${prefix}${field.name}`;
    const child = value[field.name];

    if (field.access?.update) found.guarded.push(path);

    if (field.localized && config.localization) found.localized.push(path);

    if (field.type === 'group' || field.type === 'tab') {
      scan(child, field.flattenedFields, `${path}.`, config, found);
    } else if (field.type === 'array' && Array.isArray(child)) {
      child.forEach((row: unknown, index) =>
        scan(row, field.flattenedFields, `${path}.${index}.`, config, found),
      );
    } else if (field.type === 'blocks' && Array.isArray(child)) {
      const blocks = fieldBlocks(field, config);

      child.forEach((row: unknown, index) => {
        const nested = isBlock(row) && blocks.find(({ slug }) => slug === row.blockType);

        if (nested) scan(row, nested.flattenedFields, `${path}.${index}.`, config, found);
      });
    }
  }
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
  let blockData: Container | undefined;
  const chain: FieldLink[] = [];

  for (let i = 0; i < segments.length; i++) {
    const field = current.find(({ name }) => name === segments[i]);
    const last = i === segments.length - 1;

    if (!field) throw notFound;

    chain.push({ field, siblingData: container, blockData });

    if (field.type === 'blocks') {
      if (!Array.isArray(container[field.name])) container[field.name] = [];

      const rows = container[field.name] as BlockData[];

      if (last) return { path, field, rows, chain };

      const row = rows[Number(segments[++i])];
      const block = row && fieldBlocks(field, config).find(({ slug }) => slug === row.blockType);

      if (!block || !INDEX.test(segments[i] ?? '')) throw notFound;

      container = row;
      current = block.flattenedFields;
      blockData = row;
    } else if (field.type === 'array' && !last) {
      const row: unknown = Array.isArray(container[field.name])
        ? (container[field.name] as unknown[])[Number(segments[++i])]
        : undefined;

      if (!isRecord(row) || !INDEX.test(segments[i] ?? '')) throw notFound;

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

import type { ToolCtx } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';
import type { SanitizedCollectionConfig, SanitizedConfig } from 'payload';

import type { BlockData, BlockList, BlockSpot, FieldLink } from './tree.js';
import {
  blockSpots,
  collectBlockLists,
  fieldBlocks,
  findBlock,
  isRecord,
  resolveBlockList,
  rowBoundFields,
} from './tree.js';

export type Position = {
  field?: string;
  index?: number;
  before?: number | string;
  after?: number | string;
};

export type Target = { collection: string; id: number | string; locale?: string; draft?: boolean };

export type Loaded = {
  collection: SanitizedCollectionConfig;
  config: SanitizedConfig;
  ctx: ToolCtx;
  doc: Record<string, unknown>;
  lists: BlockList[];
  all: BlockList[];
  input: Target;
};

export function takenIds(loaded: Loaded, except = new Set<string>()): Set<string> {
  return new Set(
    loaded.all
      .flatMap(({ rows }) => rows.map(({ id }) => String(id)))
      .filter((id) => !except.has(id)),
  );
}

export function claimIds(ids: string[], taken: Set<string>): void {
  for (const id of ids) {
    if (taken.has(id)) throw new Error(`A block with the id '${id}' already exists.`);

    taken.add(id);
  }
}

export function assertMovable(loaded: Loaded, from: BlockList, row: BlockData): void {
  const block = blockOf(loaded, from, row);

  if (!block) return;

  const { guarded, localized } = rowBoundFields(row, block, loaded.config);
  const lost = [
    ...(guarded.length && !loaded.ctx.overrideAccess
      ? [`fields with their own edit access (${guarded.join(', ')})`]
      : []),
    ...(localized.length ? [`the other locales of ${localized.join(', ')}`] : []),
  ];

  if (lost.length) {
    throw new Error(
      `Moving this block to another blocks field would lose ${lost.join(' and ')}. Move it within its field instead.`,
    );
  }
}

export async function may(
  loaded: Loaded,
  chain: FieldLink[],
  operation: 'read' | 'update',
  sent?: Record<string, unknown>,
) {
  const { collection, ctx, doc } = loaded;

  if (operation === 'read' && chain.some(({ field }) => 'hidden' in field && field.hidden)) {
    return false;
  }

  if (ctx.overrideAccess) return true;

  for (const { field, siblingData, blockData } of chain) {
    const access = field.access?.[operation];
    const args = {
      id: doc.id as number | string,
      blockData,
      collection,
      data: sent ?? doc,
      doc,
      req: toPayloadRequest(ctx.req),
      siblingData: sent && siblingData === doc ? sent : siblingData,
    };

    if (access && !(await access(args))) return false;
  }

  return true;
}

export function notSaved(path: string): Error {
  return new Error(`The change to ${path} didn't save. Call listBlocks to see the document now.`);
}

export function blockListsOf(loaded: Loaded, doc: Record<string, unknown>): BlockList[] {
  return collectBlockLists(doc, loaded.collection.flattenedFields, loaded.config);
}

export async function save(loaded: Loaded, lists: BlockList[], spot: BlockSpot) {
  const { saved, draft } = await persist(loaded, lists);
  const where = placed(loaded, spot);
  const found = blockSpots(blockListsOf(loaded, saved), spot.list.rows[spot.index]?.id ?? '');
  const [hit] = found;
  let result: Record<string, unknown>;

  if (found.length === 1 && hit && hit.list.path === where.path && hit.index === where.index) {
    result = describe(hit);
  } else if (!hit && !(await may(loaded, spot.list.chain, 'read'))) {
    result = { path: where.path };
  } else {
    throw notSaved(where.path);
  }

  return draft === undefined ? result : { ...result, draft };
}

export async function persist(loaded: Loaded, lists: BlockList[]) {
  const { collection, ctx, doc, input } = loaded;
  const keys = new Set(lists.map(({ path }) => path.split('.')[0]));
  const data: Record<string, unknown> = Object.fromEntries([...keys].map((key) => [key, doc[key]]));

  const draft = hasDrafts(collection) ? (input.draft ?? true) : undefined;

  if (draft === false) data._status = 'published';

  for (const list of new Set(lists)) {
    if (!(await may(loaded, list.chain, 'update', data))) {
      throw new Error(`You can't edit the blocks in ${list.path}.`);
    }
  }

  const saved = (await ctx.frogbot.update({
    collection: collection.slug,
    id: doc.id as number | string,
    data,
    depth: 0,
    draft,
    locale: input.locale,
    overrideAccess: ctx.overrideAccess,
    req: ctx.req,
  })) as Record<string, unknown>;

  return { saved, draft };
}

export function placed(loaded: Loaded, { list, index }: BlockSpot) {
  const now = blockListsOf(loaded, loaded.doc).find(({ rows }) => rows === list.rows);

  return { path: now?.path ?? list.path, index };
}

export async function place(
  loaded: Loaded,
  lists: BlockList[],
  input: Position,
  row: BlockData,
  field?: BlockList,
): Promise<BlockSpot> {
  const given = [input.field, input.before, input.after].filter((value) => value !== undefined);

  if (given.length !== 1) throw new Error('Pass exactly one of field, before or after.');

  if (input.index !== undefined && input.field === undefined) {
    throw new Error('index goes with field.');
  }

  const anchor = input.before ?? input.after;
  let spot: BlockSpot;

  if (anchor === undefined) {
    const list = field ?? (await resolve(loaded, input.field as string));
    const index = input.index ?? list.rows.length;

    if (input.index !== undefined && !(await may(loaded, list.chain, 'read'))) {
      throw new Error(
        `You can't read ${list.path}, so you can't pick an index in it. Leave index out to add at the end.`,
      );
    }

    if (index > list.rows.length) {
      throw new Error(
        `index ${index} is past the end of ${list.path}, which has ${list.rows.length} blocks.`,
      );
    }

    spot = { list, index };
  } else {
    const found = findBlock(lists, anchor);

    spot = { list: found.list, index: found.index + (input.after === undefined ? 0 : 1) };
  }

  const accepted = fieldBlocks(spot.list.field, loaded.config).map(({ slug }) => slug);

  if (!accepted.includes(row.blockType)) {
    throw new Error(
      `${spot.list.path} doesn't accept '${row.blockType}' blocks. It accepts: ${accepted.join(', ')}.`,
    );
  }

  spot.list.rows.splice(spot.index, 0, row);

  return spot;
}

export async function resolve(loaded: Loaded, path: string): Promise<BlockList> {
  const list = resolveBlockList(loaded.doc, loaded.collection.flattenedFields, path, loaded.config);

  if (!(await may(loaded, list.chain.slice(0, -1), 'read'))) {
    throw new Error(`'${path}' is not a blocks field. Call listBlocks to see the fields' paths.`);
  }

  return list;
}

export function describe({ list, index }: BlockSpot) {
  return { path: list.path, index, block: list.rows[index] };
}

export function blockOf(loaded: Loaded, list: BlockList, row: BlockData) {
  return fieldBlocks(list.field, loaded.config).find(({ slug }) => slug === row.blockType);
}

export function blockIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(blockIds);

  if (!isRecord(value)) return [];

  const own = typeof value.blockType === 'string' && value.id != null ? [String(value.id)] : [];

  return [...own, ...Object.values(value).flatMap(blockIds)];
}

export function nestedIds(row: BlockData): string[] {
  return blockIds(Object.values(row));
}

export function hasDrafts(collection: SanitizedCollectionConfig): boolean {
  return isRecord(collection.versions) && Boolean(collection.versions.drafts);
}

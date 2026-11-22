import { randomBytes } from 'node:crypto';

import type { Tool, ToolCtx } from 'frogbot';
import type { AnyTool } from 'frogbot/internal';
import { getPayloadConfig, isInternalCollection } from 'frogbot/internal';
import type { Field } from 'payload';
import { ValidationError } from 'payload';
import { z } from 'zod';

import type { Loaded, Target } from './edit.js';
import {
  assertMovable,
  blockIds,
  blockListsOf,
  blockOf,
  claimIds,
  describe,
  hasDrafts,
  may,
  nestedIds,
  notSaved,
  persist,
  place,
  resolve,
  save,
  takenIds,
} from './edit.js';
import { blockInputs, hasBlocks } from './schema.js';
import type { BlockData, BlockList } from './tree.js';
import {
  blockSpots,
  blockTitle,
  collectBlockLists,
  fieldBlocks,
  findBlock,
  hasBlocksField,
  mergePatch,
} from './tree.js';

export type BlockToolsOptions = {
  /** The collections the tools may edit, of those with a blocks field. @default all of them */
  collections?: readonly string[];
};

const annotations = (title: string, writes: boolean) => ({
  title,
  readOnlyHint: !writes,
  destructiveHint: writes,
  idempotentHint: !writes,
  openWorldHint: false,
});

/**
 * Tools that read and edit one block at a time in a collection's blocks fields, nested ones
 * included, so an agent never rewrites a whole blocks array. Pass them to `mcpPlugin({ tools })`
 * or an agent's `tools`. Each call runs with the caller's access.
 */
export function blockTools(options: BlockToolsOptions = {}): AnyTool[] {
  const tools = buildBlockTools(options, options.collections ?? []);

  for (const tool of tools) unbound.set(tool, options);

  return tools;
}

const unbound = new WeakMap<object, BlockToolsOptions>();

/**
 * Lists the collections the block tools can edit in their `collection` input, once the app's
 * collections are known: those with a blocks field, narrowed to `collections` when it's given.
 * Other tools pass through unchanged.
 */
export function bindBlockTools<T extends object>(
  tools: readonly T[],
  collections: readonly { slug: string; fields: Field[]; custom?: Record<string, unknown> }[],
): (T | AnyTool)[] {
  const built = new Map<BlockToolsOptions, AnyTool[]>();

  return tools.map((tool) => {
    const options = unbound.get(tool);

    if (!options) return tool;

    if (!built.has(options)) {
      const choices = collections
        .filter(
          (collection) =>
            (options.collections?.includes(collection.slug) ?? true) &&
            !isInternalCollection(collection) &&
            hasBlocks(collection.fields),
        )
        .map(({ slug }) => slug);

      built.set(options, buildBlockTools(options, choices));
    }

    return built.get(options)?.find(({ slug }) => slug === (tool as AnyTool).slug) ?? tool;
  });
}

function buildBlockTools(options: BlockToolsOptions, choices: readonly string[]): AnyTool[] {
  const { target, write, blockId, position } = blockInputs(choices);
  const run = (writes: boolean) => (input: Target, ctx: ToolCtx, handle: Handle) =>
    runTool({ input, ctx, handle, writes, allowed: options.collections });

  const read = run(false);
  const edit = run(true);

  const listBlocks = tool({
    slug: 'listBlocks',
    annotations: annotations('List Blocks', false),
    description:
      "Outline a document's blocks fields: each field's path and the block types it accepts, and each block's id, type and title. Read this before editing blocks.",
    inputSchema: z.object(target),
    execute: (input, ctx) =>
      read(input, ctx, ({ lists, loaded }) => ({
        fields: lists.map((list) => ({
          path: list.path,
          blockTypes: fieldBlocks(list.field, loaded.config).map(({ slug }) => slug),
          blocks: list.rows.map((row, index) => ({
            index,
            id: row.id,
            blockType: row.blockType,
            title: blockTitle(row, blockOf(loaded, list, row)),
          })),
        })),
      })),
  });

  const getBlock = tool({
    slug: 'getBlock',
    annotations: annotations('Get Block', false),
    description: "Read one block's full data by its id.",
    inputSchema: z.object({ ...target, blockId }),
    execute: (input, ctx) =>
      read(input, ctx, ({ lists }) => describe(findBlock(lists, input.blockId))),
  });

  const insertBlock = tool({
    slug: 'insertBlock',
    annotations: annotations('Insert Block', true),
    description:
      'Add one block to a blocks field. Place it with before or after another block id, or with field and an optional index. The rest of the document is unchanged.',
    inputSchema: z.object({
      ...write,
      ...position,
      block: z
        .record(z.string(), z.unknown())
        .describe("The block's data, with its blockType. Use getCollectionSchema for its fields."),
    }),
    execute: (input, ctx) =>
      edit(input, ctx, async ({ lists, loaded }) => {
        const { block } = input;

        if (typeof block.blockType !== 'string') throw new Error('block needs a blockType.');

        const row: BlockData = {
          ...block,
          blockType: block.blockType,
          id: typeof block.id === 'string' && block.id ? block.id : randomBytes(12).toString('hex'),
        };

        claimIds(blockIds(row), takenIds(loaded));

        const spot = await place(loaded, lists, input, row);

        return save(loaded, [spot.list], spot);
      }),
  });

  const updateBlock = tool({
    slug: 'updateBlock',
    annotations: annotations('Update Block', true),
    description:
      "Change some fields of one block. Only the fields in data change; a group merges key by key, and any other field's value is replaced whole.",
    inputSchema: z.object({
      ...write,
      blockId,
      data: z.record(z.string(), z.unknown()).describe('The fields to change.'),
    }),
    execute: (input, ctx) =>
      edit(input, ctx, async ({ lists, loaded }) => {
        if ('id' in input.data || 'blockType' in input.data) {
          throw new Error(
            "data can't change a block's id or blockType. Insert a new block and remove this one.",
          );
        }

        const { list, index } = findBlock(lists, input.blockId);
        const row = list.rows[index];
        const fields = blockOf(loaded, list, row)?.flattenedFields ?? [];

        const merged: BlockData = {
          ...mergePatch(row, input.data, fields),
          id: row.id,
          blockType: row.blockType,
        };

        claimIds(nestedIds(merged), takenIds(loaded, new Set(nestedIds(row))));

        list.rows[index] = merged;

        return save(loaded, [list], { list, index });
      }),
  });

  const moveBlock = tool({
    slug: 'moveBlock',
    annotations: annotations('Move Block', true),
    description:
      'Move one block, with its content, before or after another block, or to an index in a blocks field, which can be another field.',
    inputSchema: z.object({ ...write, ...position, blockId }),
    execute: (input, ctx) =>
      edit(input, ctx, async ({ lists, loaded }) => {
        const from = findBlock(lists, input.blockId);
        const row = from.list.rows[from.index];
        const inside = `${from.list.path}.${from.index}.`;

        const into = input.field ?? from.list.path;
        const anchor = input.before ?? input.after;
        const anchorPath = anchor === undefined ? into : findBlock(lists, anchor).list.path;

        if (anchor !== undefined && String(anchor) === String(row.id)) {
          throw new Error("A block can't move next to itself.");
        }

        if (`${anchorPath}.`.startsWith(inside)) {
          throw new Error("A block can't move inside itself.");
        }

        const field = input.field === undefined ? undefined : await resolve(loaded, input.field);

        from.list.rows.splice(from.index, 1);

        const spot = await place(loaded, lists, input, row, field);

        if (spot.list.rows !== from.list.rows) assertMovable(loaded, from.list, row);

        return save(loaded, [from.list, spot.list], spot);
      }),
  });

  const removeBlock = tool({
    slug: 'removeBlock',
    annotations: annotations('Remove Block', true),
    description: 'Delete one block, and any blocks inside it.',
    inputSchema: z.object({ ...write, blockId }),
    execute: (input, ctx) =>
      edit(input, ctx, async ({ lists, loaded }) => {
        const { list, index } = findBlock(lists, input.blockId);
        const [removed] = list.rows.splice(index, 1);
        const { saved } = await persist(loaded, [list]);
        const left = blockSpots(blockListsOf(loaded, saved), removed?.id ?? '');

        if (left.length && (await may(loaded, list.chain, 'read'))) throw notSaved(list.path);

        return {
          removed: { path: list.path, index, id: removed?.id, blockType: removed?.blockType },
        };
      }),
  });

  return [listBlocks, getBlock, insertBlock, updateBlock, moveBlock, removeBlock];
}

function tool<TSchema extends z.ZodType>(definition: Tool<TSchema>): Tool<TSchema> {
  return definition;
}

type Handle = (args: { lists: BlockList[]; loaded: Loaded }) => unknown;

async function runTool({
  input,
  ctx,
  handle,
  writes,
  allowed,
}: {
  input: Target;
  ctx: ToolCtx;
  handle: Handle;
  writes: boolean;
  allowed?: readonly string[];
}): Promise<unknown> {
  try {
    const loaded = await load({ input, ctx, writes, allowed });

    return await handle({ lists: loaded.lists, loaded });
  } catch (error) {
    throw new Error(errorText(error), { cause: error });
  }
}

async function load({
  input,
  ctx,
  writes,
  allowed,
}: {
  input: Target;
  ctx: ToolCtx;
  writes: boolean;
  allowed?: readonly string[];
}): Promise<Loaded> {
  const config = await getPayloadConfig(ctx.frogbot.config);
  const collection = config.collections.find(({ slug }) => slug === input.collection);
  const { frogbot } = ctx;

  const editable =
    collection &&
    !isInternalCollection(collection) &&
    (allowed?.includes(collection.slug) ?? true) &&
    hasBlocksField(collection.flattenedFields);

  if (!collection || !editable) {
    throw new Error(`The block tools can't edit the collection '${input.collection}'.`);
  }

  const args = {
    collection: collection.slug,
    id: toID(
      input.id,
      collection.flattenedFields.find(({ name }) => name === 'id')?.type ??
        frogbot.db.defaultIDType,
    ),
    depth: 0,
    draft: hasDrafts(collection),
    fallbackLocale: 'none',
    locale: input.locale,
    req: ctx.req,
  };

  const checked = (await frogbot.findByID({
    ...args,
    overrideAccess: ctx.overrideAccess,
  })) as Record<string, unknown>;

  const stored = (await frogbot.findByID({
    ...args,
    overrideAccess: true,
    showHiddenFields: true,
  })) as Record<string, unknown>;

  const all = collectBlockLists(stored, collection.flattenedFields, config);
  const loaded: Loaded = { collection, config, ctx, doc: stored, lists: [], all, input };
  const mayRead = await Promise.all(all.map((list) => may(loaded, list.chain, 'read')));
  const readable = new Set(all.filter((_, index) => mayRead[index]).map(({ path }) => path));
  const visible = collectBlockLists(checked, collection.flattenedFields, config).filter(
    ({ path }) => readable.has(path),
  );

  return writes
    ? { ...loaded, lists: sameRows(all, visible) }
    : { ...loaded, doc: checked, lists: visible, all: visible };
}

function sameRows(all: BlockList[], visible: BlockList[]): BlockList[] {
  const rowsAt = new Map(visible.map((list) => [list.path, rowKey(list)]));

  return all.filter((list) => rowsAt.get(list.path) === rowKey(list));
}

function rowKey({ rows }: BlockList): string {
  return JSON.stringify(rows.map(({ id }) => String(id)));
}

function toID(id: number | string, type: string): number | string {
  return type === 'number' && typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
}

function errorText(error: unknown): string {
  if (error instanceof ValidationError) {
    const issues = error.data.errors.map(({ message, path }) =>
      path ? `${path}: ${message}` : message,
    );

    return `Validation failed:\n${issues.join('\n')}\nUse getCollectionSchema for the block's fields.`;
  }

  return error instanceof Error ? error.message : String(error);
}

import { randomBytes } from 'node:crypto';

import type { Tool, ToolCtx } from 'frogbot';
import type { AnyTool } from 'frogbot/internal';
import { getPayloadConfig, isInternalCollection } from 'frogbot/internal';
import type { SanitizedCollectionConfig, SanitizedConfig } from 'payload';
import { ValidationError } from 'payload';
import { z } from 'zod';

import type { BlockData, BlockList, BlockSpot } from './tree.js';
import {
  blockTitle,
  collectBlockLists,
  fieldBlocks,
  findBlock,
  isRecord,
  mergePatch,
  resolveBlockList,
} from './tree.js';

export type BlockToolsOptions = {
  /** The collections the tools may edit, of those with a blocks field. @default all of them */
  collections?: readonly string[];
};

const target = {
  collection: z.string().describe('The collection slug.'),
  id: z.union([z.string(), z.number()]).describe('The document id.'),
  locale: z.string().optional().describe('The locale to read and write, for localized fields.'),
};

const write = {
  ...target,
  draft: z
    .boolean()
    .optional()
    .describe(
      'On a collection with drafts, save as a draft (the default) or pass false to publish. Ignored otherwise.',
    ),
};

const blockId = z.union([z.string(), z.number()]).describe('The id of the block, from listBlocks.');

const position = {
  field: z
    .string()
    .optional()
    .describe('The path of the blocks field, from listBlocks, such as layout or layout.2.columns.'),
  index: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('With field: the position in that field, from 0. Defaults to the end.'),
  before: blockId.optional().describe('Place it right before the block with this id.'),
  after: blockId.optional().describe('Place it right after the block with this id.'),
};

type Position = {
  field?: string;
  index?: number;
  before?: number | string;
  after?: number | string;
};

type Target = { collection: string; id: number | string; locale?: string; draft?: boolean };

type Loaded = {
  collection: SanitizedCollectionConfig;
  config: SanitizedConfig;
  ctx: ToolCtx;
  doc: Record<string, unknown>;
  lists: BlockList[];
  input: Target;
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

        const taken = new Set(lists.flatMap(({ rows }) => rows.map(({ id }) => String(id))));

        for (const id of blockIds(row)) {
          if (taken.has(id)) throw new Error(`A block with the id '${id}' already exists.`);

          taken.add(id);
        }

        const spot = place(loaded, lists, input, row);

        return save(loaded, [spot.list], row.id);
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

        list.rows[index] = {
          ...mergePatch(row, input.data, fields),
          id: row.id,
          blockType: row.blockType,
        };

        return save(loaded, [list], row.id);
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

        const field = input.field === undefined ? undefined : resolve(loaded, input.field);

        from.list.rows.splice(from.index, 1);

        const spot = place(loaded, lists, input, row, field);

        return save(loaded, [from.list, spot.list], row.id);
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

        await save(loaded, [list]);

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
    collectBlockLists({}, collection.flattenedFields, config).length > 0;

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

  const doc = writes
    ? ((await frogbot.findByID({
        ...args,
        overrideAccess: true,
        showHiddenFields: true,
      })) as Record<string, unknown>)
    : checked;

  const lists = collectBlockLists(doc, collection.flattenedFields, config);

  return { collection, config, ctx, doc, lists, input };
}

async function save(loaded: Loaded, lists: BlockList[], blockId?: number | string) {
  const { collection, ctx, doc, input } = loaded;
  const keys = new Set(lists.map(({ path }) => path.split('.')[0]));
  const data = Object.fromEntries([...keys].map((key) => [key, doc[key]]));
  const draft = hasDrafts(collection) ? (input.draft ?? true) : undefined;

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

  if (blockId === undefined) return undefined;

  const result = describe(
    findBlock(collectBlockLists(saved, collection.flattenedFields, loaded.config), blockId),
  );

  return draft === undefined ? result : { ...result, draft };
}

function place(
  loaded: Loaded,
  lists: BlockList[],
  input: Position,
  row: BlockData,
  field?: BlockList,
): BlockSpot {
  const given = [input.field, input.before, input.after].filter((value) => value !== undefined);

  if (given.length !== 1) throw new Error('Pass exactly one of field, before or after.');

  if (input.index !== undefined && input.field === undefined) {
    throw new Error('index goes with field.');
  }

  const anchor = input.before ?? input.after;
  let spot: BlockSpot;

  if (anchor === undefined) {
    const list = field ?? resolve(loaded, input.field as string);
    const index = input.index ?? list.rows.length;

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

function resolve(loaded: Loaded, path: string): BlockList {
  return resolveBlockList(loaded.doc, loaded.collection.flattenedFields, path, loaded.config);
}

function describe({ list, index }: BlockSpot) {
  return { path: list.path, index, block: list.rows[index] };
}

function blockOf(loaded: Loaded, list: BlockList, row: BlockData) {
  return fieldBlocks(list.field, loaded.config).find(({ slug }) => slug === row.blockType);
}

function blockIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(blockIds);

  if (!isRecord(value)) return [];

  const own = typeof value.blockType === 'string' && value.id != null ? [String(value.id)] : [];

  return [...own, ...Object.values(value).flatMap(blockIds)];
}

function toID(id: number | string, type: string): number | string {
  return type === 'number' && typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
}

function hasDrafts(collection: SanitizedCollectionConfig): boolean {
  return isRecord(collection.versions) && Boolean(collection.versions.drafts);
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

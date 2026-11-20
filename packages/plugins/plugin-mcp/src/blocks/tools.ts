import { randomBytes } from 'node:crypto';

import { defineCollectionTool } from '@payloadcms/plugin-mcp';
import type { FrogBotRequest } from 'frogbot';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { PayloadRequest, SanitizedCollectionConfig, SanitizedConfig } from 'payload';
import { parseDocumentID, ValidationError } from 'payload';
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

type CollectionTool = ReturnType<ReturnType<typeof defineCollectionTool>['handler']>;

type CollectionToolAccess = NonNullable<CollectionTool['access']>;

type MCPToolResponse = Awaited<ReturnType<CollectionTool['handler']>>;

/** The block tools: config key and MCP wire name, and whether each one writes. */
export const BLOCK_TOOLS = {
  listBlocks: { writes: false },
  getBlock: { writes: false },
  insertBlock: { writes: true },
  updateBlock: { writes: true },
  moveBlock: { writes: true },
  removeBlock: { writes: true },
} as const;

export type BlockToolName = keyof typeof BLOCK_TOOLS;

const target = {
  slug: z.string().describe('The collection slug.'),
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

type Target = { id: number | string; locale?: string; draft?: boolean };

type Loaded = {
  collection: SanitizedCollectionConfig;
  config: SanitizedConfig;
  doc: Record<string, unknown>;
  lists: BlockList[];
  req: FrogBotRequest;
  slug: string;
  input: Target;
};

const annotations = (title: string, writes: boolean) => ({
  title,
  readOnlyHint: !writes,
  destructiveHint: writes,
  idempotentHint: !writes,
  openWorldHint: false,
});

const readAccess: CollectionToolAccess = ({ permissions, req, slug }) =>
  Boolean(req.user && permissions?.collections?.[slug]?.read);

const updateAccess: CollectionToolAccess = ({ permissions, req, slug }) =>
  Boolean(req.user && permissions?.collections?.[slug]?.update);

export const blockTools: Record<BlockToolName, CollectionTool> = {
  listBlocks: defineCollectionTool({
    access: readAccess,
    annotations: annotations('List Blocks', false),
    description:
      "Outline a document's blocks fields: each field's path and the block types it accepts, and each block's id, type and title. Read this before editing blocks.",
    input: z.object(target),
  }).handler(({ slug, input, req }) =>
    run(slug, input, req, ({ lists, loaded }) => ({
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
  ),

  getBlock: defineCollectionTool({
    access: readAccess,
    annotations: annotations('Get Block', false),
    description: "Read one block's full data by its id.",
    input: z.object({ ...target, blockId }),
  }).handler(({ slug, input, req }) =>
    run(slug, input, req, ({ lists }) => describe(findBlock(lists, input.blockId))),
  ),

  insertBlock: defineCollectionTool({
    access: updateAccess,
    annotations: annotations('Insert Block', true),
    description:
      'Add one block to a blocks field. Place it with before or after another block id, or with field and an optional index. The rest of the document is unchanged.',
    input: z.object({
      ...write,
      ...position,
      block: z
        .record(z.string(), z.unknown())
        .describe("The block's data, with its blockType. Use getCollectionSchema for its fields."),
    }),
  }).handler(({ slug, input, req }) =>
    edit(slug, input, req, async ({ lists, loaded }) => {
      const { block } = input;

      if (typeof block.blockType !== 'string') throw new Error('block needs a blockType.');

      const row: BlockData = {
        ...block,
        blockType: block.blockType,
        id: typeof block.id === 'string' && block.id ? block.id : randomBytes(12).toString('hex'),
      };

      if (lists.some((list) => list.rows.some(({ id }) => String(id) === String(row.id)))) {
        throw new Error(`A block with the id '${row.id}' already exists.`);
      }

      const spot = place(loaded, lists, input, row);

      return save(loaded, [spot.list], row.id);
    }),
  ),

  updateBlock: defineCollectionTool({
    access: updateAccess,
    annotations: annotations('Update Block', true),
    description:
      "Change some fields of one block. Only the fields in data change; a group merges key by key, and any other field's value is replaced whole.",
    input: z.object({
      ...write,
      blockId,
      data: z.record(z.string(), z.unknown()).describe('The fields to change.'),
    }),
  }).handler(({ slug, input, req }) =>
    edit(slug, input, req, async ({ lists, loaded }) => {
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
  ),

  moveBlock: defineCollectionTool({
    access: updateAccess,
    annotations: annotations('Move Block', true),
    description:
      'Move one block, with its content, before or after another block, or to an index in a blocks field, which can be another field.',
    input: z.object({ ...write, ...position, blockId }),
  }).handler(({ slug, input, req }) =>
    edit(slug, input, req, async ({ lists, loaded }) => {
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
  ),

  removeBlock: defineCollectionTool({
    access: updateAccess,
    annotations: annotations('Remove Block', true),
    description: 'Delete one block, and any blocks inside it.',
    input: z.object({ ...write, blockId }),
  }).handler(({ slug, input, req }) =>
    edit(slug, input, req, async ({ lists, loaded }) => {
      const { list, index } = findBlock(lists, input.blockId);
      const [removed] = list.rows.splice(index, 1);

      await save(loaded, [list]);

      return {
        removed: { path: list.path, index, id: removed?.id, blockType: removed?.blockType },
      };
    }),
  ),
};

type Handle = (args: { lists: BlockList[]; loaded: Loaded }) => unknown;

function edit(slug: string, input: Target, req: PayloadRequest, handle: Handle) {
  return run(slug, input, req, handle, true);
}

async function run(
  slug: string,
  input: Target,
  req: PayloadRequest,
  handle: Handle,
  writes = false,
): Promise<MCPToolResponse> {
  try {
    const loaded = await load(slug, input, req, writes);
    const result = await handle({ lists: loaded.lists, loaded });
    const text = JSON.stringify(result);

    return {
      content: [{ type: 'text', text }],
      structuredContent: JSON.parse(text) as Record<string, unknown>,
    };
  } catch (error) {
    return { content: [{ type: 'text', text: errorText(error) }], isError: true };
  }
}

async function load(
  slug: string,
  input: Target,
  req: PayloadRequest,
  writes: boolean,
): Promise<Loaded> {
  const collection = req.payload.collections[slug]?.config;

  if (!collection) throw new Error(`No collection has the slug '${slug}'.`);

  const frogbotReq = attachRegisteredFrogBot(req);

  const args = {
    collection: slug,
    id: parseDocumentID({
      id: input.id,
      collectionSlug: slug,
      payload: req.payload,
    }),
    depth: 0,
    draft: hasDrafts(collection),
    locale: input.locale,
    req: frogbotReq,
  };

  const checked = (await frogbotReq.frogbot.findByID({ ...args, overrideAccess: false })) as Record<
    string,
    unknown
  >;

  const doc = writes
    ? ((await frogbotReq.frogbot.findByID({
        ...args,
        overrideAccess: true,
        showHiddenFields: true,
      })) as Record<string, unknown>)
    : checked;

  const lists = collectBlockLists(doc, collection.flattenedFields, req.payload.config);

  return { collection, config: req.payload.config, doc, lists, req: frogbotReq, slug, input };
}

async function save(loaded: Loaded, lists: BlockList[], blockId?: number | string) {
  const { collection, doc, input, req, slug } = loaded;
  const keys = new Set(lists.map(({ path }) => path.split('.')[0]));
  const data = Object.fromEntries([...keys].map((key) => [key, doc[key]]));
  const draft = hasDrafts(collection) ? (input.draft ?? true) : undefined;

  const saved = (await req.frogbot.update({
    collection: slug,
    id: doc.id as number | string,
    data,
    depth: 0,
    draft,
    locale: input.locale,
    overrideAccess: false,
    req,
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

import { type Block, type Field, fieldAffectsData } from 'frogbot';

/** Field names to strip at one level of a document: `true` drops the value, a tree recurses into it. */
export type HiddenTree = Map<string, HiddenNode>;

type HiddenNode =
  | true
  | { kind: 'object'; tree: HiddenTree }
  | { kind: 'rows'; tree: HiddenTree }
  | { kind: 'blocks'; trees: Map<string, HiddenTree> };

function blockFields(block: Block | string, blocks: readonly Block[]): Block | undefined {
  return typeof block === 'string' ? blocks.find((item) => item.slug === block) : block;
}

function walk(fields: readonly Field[], blocks: readonly Block[], tree: HiddenTree): HiddenTree {
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          if (tab.hidden) tree.set(tab.name, true);
          else nest(tree, tab.name, 'object', walk(tab.fields, blocks, new Map()));
        } else {
          walk(tab.fields, blocks, tree);
        }
      }

      continue;
    }

    if (!fieldAffectsData(field)) {
      if ('fields' in field) walk(field.fields, blocks, tree);
      continue;
    }

    if ('hidden' in field && field.hidden) {
      tree.set(field.name, true);
      continue;
    }

    if (field.type === 'group' || field.type === 'array') {
      const kind = field.type === 'group' ? 'object' : 'rows';

      nest(tree, field.name, kind, walk(field.fields, blocks, new Map()));
    }

    if (field.type === 'blocks') {
      const trees = new Map<string, HiddenTree>();

      for (const reference of field.blocks) {
        const block = blockFields(reference, blocks);
        const blockTree = block ? walk(block.fields, blocks, new Map()) : new Map();

        if (block && blockTree.size) trees.set(block.slug, blockTree);
      }

      if (trees.size) tree.set(field.name, { kind: 'blocks', trees });
    }
  }

  return tree;
}

function nest(tree: HiddenTree, name: string, kind: 'object' | 'rows', child: HiddenTree) {
  if (child.size) tree.set(name, { kind, tree: child });
}

/** Collects the paths of `hidden: true` fields, through groups, tabs, rows, collapsibles, arrays and blocks. */
export function hiddenTree(fields: readonly Field[], blocks: readonly Block[] = []): HiddenTree {
  return walk(fields, blocks, new Map());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripValue(value: unknown, node: Exclude<HiddenNode, true>): unknown {
  if (node.kind === 'object') return isRecord(value) ? stripHidden(value, node.tree) : value;
  if (!Array.isArray(value)) return value;

  return value.map((row: unknown) => {
    if (!isRecord(row)) return row;
    if (node.kind === 'rows') return stripHidden(row, node.tree);
    const tree = typeof row.blockType === 'string' ? node.trees.get(row.blockType) : undefined;

    return tree ? stripHidden(row, tree) : row;
  });
}

/** Returns a copy of `doc` without hidden fields, or `doc` itself when the tree is empty. */
export function stripHidden<T extends Record<string, unknown>>(doc: T, tree: HiddenTree): T {
  if (!tree.size) return doc;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(doc)) {
    const node = tree.get(key);

    if (node === true) continue;
    result[key] = node ? stripValue(value, node) : value;
  }

  return result as T;
}

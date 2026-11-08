/** Field names to strip at one level of a document: `true` drops the value, a tree recurses into it. */
export type HiddenTree = Map<string, HiddenNode>;

type HiddenNode =
  | true
  | { kind: 'object'; tree: HiddenTree }
  | { kind: 'rows'; tree: HiddenTree }
  | { kind: 'blocks'; trees: Map<string, HiddenTree> };

type Shape = Record<string, unknown>;

function list(value: unknown): Shape[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function named(field: Shape): string | undefined {
  return typeof field.name === 'string' && field.name ? field.name : undefined;
}

function nest(tree: HiddenTree, name: string, kind: 'object' | 'rows', child: HiddenTree) {
  if (child.size) tree.set(name, { kind, tree: child });
}

function blockTrees(field: Shape, blocks: readonly Shape[]): Map<string, HiddenTree> {
  const trees = new Map<string, HiddenTree>();
  const references: unknown[] = [
    ...(Array.isArray(field.blocks) ? field.blocks : []),
    ...(Array.isArray(field.blockReferences) ? field.blockReferences : []),
  ];

  for (const reference of references) {
    const block =
      typeof reference === 'string' ? blocks.find((item) => item.slug === reference) : reference;

    if (!isRecord(block) || typeof block.slug !== 'string' || trees.has(block.slug)) continue;
    const tree = walk(list(block.fields), blocks, new Map());

    if (tree.size) trees.set(block.slug, tree);
  }

  return trees;
}

function walk(fields: readonly Shape[], blocks: readonly Shape[], tree: HiddenTree): HiddenTree {
  for (const field of fields) {
    const name = named(field);

    if (field.type === 'tabs') {
      for (const tab of list(field.tabs)) {
        const tabName = named(tab);

        if (!tabName) walk(list(tab.fields), blocks, tree);
        else if (tab.hidden === true) tree.set(tabName, true);
        else nest(tree, tabName, 'object', walk(list(tab.fields), blocks, new Map()));
      }

      continue;
    }

    if (!name || field.type === 'ui') {
      walk(list(field.fields), blocks, tree);
      continue;
    }

    if (field.hidden === true) {
      tree.set(name, true);
      continue;
    }

    if (field.type === 'group' || field.type === 'array') {
      const kind = field.type === 'group' ? 'object' : 'rows';

      nest(tree, name, kind, walk(list(field.fields), blocks, new Map()));
    }

    if (field.type === 'blocks') {
      const trees = blockTrees(field, blocks);

      if (trees.size) tree.set(name, { kind: 'blocks', trees });
    }
  }

  return tree;
}

/**
 * Collects the paths of `hidden: true` fields, through groups, tabs, rows, collapsibles, arrays
 * and blocks. Takes a collection's final fields, so fields core or later plugins add count too.
 */
export function hiddenTree(
  fields: readonly unknown[],
  blocks: readonly unknown[] = [],
): HiddenTree {
  return walk(list(fields), list(blocks), new Map());
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

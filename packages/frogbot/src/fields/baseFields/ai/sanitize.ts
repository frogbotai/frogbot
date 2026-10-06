import { flattenTopLevelFields } from 'payload/shared';

import { getConfiguredChatModelIds, getConfiguredModelIds } from '../../../ai/models.js';
import type { AIConfig } from '../../../ai/types.js';
import type { CollectionConfig } from '../../../collections/config/types.js';
import type { ValidationMode } from '../../../config/validationContext.js';
import type { Block, Field } from '../../config/types.js';
import { getAIKind } from './hooks.js';
import { aiFieldPaths, type AIKind } from './state.js';
import { resolveAIFieldModel } from './task.js';

export type SanitizeAIFieldsArgs = {
  ai: AIConfig | undefined;
  blocks?: Block[];
  collections: CollectionConfig[];
  mode: ValidationMode;
};

type AIFieldEntry = { kind: AIKind; name: string };

function fieldName(field: Field): string | undefined {
  const name = 'name' in field ? field.name : undefined;

  return typeof name === 'string' && name !== '' ? name : undefined;
}

function childFieldLists(field: Field): Field[][] {
  if (field.type === 'tabs') return field.tabs.map((tab) => tab.fields);

  if (field.type === 'blocks') {
    const blocks = [...field.blocks, ...(field.blockReferences ?? [])];

    return blocks.filter((block) => typeof block !== 'string').map((block) => block.fields);
  }

  return 'fields' in field && Array.isArray(field.fields) ? [field.fields] : [];
}

function rejectNested(fields: Field[], where: string): void {
  for (const field of fields) {
    const name = fieldName(field);

    if (name && getAIKind(field)) {
      throw new Error(
        `[frogbot] aiField "${name}" must be a top-level field of a collection; found in ${where}`,
      );
    }

    for (const children of childFieldLists(field)) rejectNested(children, where);
  }
}

function collectAIFields({
  fields,
  found,
  slug,
}: {
  fields: Field[];
  found: AIFieldEntry[];
  slug: string;
}): void {
  const nested = `an array, blocks, group or named tab in collection "${slug}"`;

  for (const field of fields) {
    const name = fieldName(field);
    const kind = getAIKind(field);

    if (name && kind) found.push({ kind, name });

    const isLayout =
      field.type === 'row' || field.type === 'collapsible' || (field.type === 'group' && !name);

    if (isLayout) {
      collectAIFields({ fields: field.fields, found, slug });
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) rejectNested(tab.fields, nested);
        else collectAIFields({ fields: tab.fields, found, slug });
      }
    } else {
      for (const children of childFieldLists(field)) rejectNested(children, nested);
    }
  }
}

function findCycle(graph: Map<string, string[]>): string[] | undefined {
  const done = new Set<string>();

  const visit = (name: string, path: string[]): string[] | undefined => {
    const start = path.indexOf(name);

    if (start !== -1) return [...path.slice(start), name];

    if (done.has(name)) return undefined;

    for (const next of graph.get(name) ?? []) {
      const cycle = visit(next, [...path, name]);

      if (cycle) return cycle;
    }

    done.add(name);

    return undefined;
  };

  for (const name of graph.keys()) {
    const cycle = visit(name, []);

    if (cycle) return cycle;
  }

  return undefined;
}

export function sanitizeAIFields({
  ai,
  blocks = [],
  collections,
  mode,
}: SanitizeAIFieldsArgs): void {
  for (const block of blocks) rejectNested(block.fields, `block "${block.slug}"`);

  const configuredModels = new Set(getConfiguredModelIds(ai));
  const chatModels = new Set(getConfiguredChatModelIds(ai));

  const modelProblem = (model: string): string | undefined => {
    const target = ai?.routers?.[model]?.model;

    if (!configuredModels.has(model) || (target !== undefined && !configuredModels.has(target))) {
      return `model '${model}' is not configured`;
    }

    return chatModels.has(model) ? undefined : `model '${model}' is not a chat model`;
  };

  for (const collection of collections) {
    const found: AIFieldEntry[] = [];

    collectAIFields({ fields: collection.fields, found, slug: collection.slug });

    if (found.length === 0) continue;

    const topLevelNames = flattenTopLevelFields(collection.fields as never)
      .map((field) => ('name' in field ? field.name : undefined))
      .filter((name): name is string => typeof name === 'string');

    const aiNames = new Set(found.map(({ name }) => name));
    const graph = new Map<string, string[]>();

    for (const { kind, name } of found) {
      const message = (problem: string) =>
        `[frogbot] aiField "${name}" in collection "${collection.slug}": ${problem}`;

      const fail = (problem: string) => new Error(message(problem));

      const problem = kind.model === undefined ? undefined : modelProblem(kind.model);

      if (problem) {
        if (mode === 'runtime') throw fail(problem);

        console.warn(message(problem));
      }

      if (!resolveAIFieldModel(ai, kind)) {
        throw fail('no model. Set `model` on the field, or `ai.smallModel` or `ai.defaultModel`');
      }

      const missing = kind.inputs.find((input) => !topLevelNames.includes(input));

      if (missing) throw fail(`input "${missing}" is not a top-level field of the collection`);

      if (kind.inputs.includes(name)) throw fail('it lists itself as an input');

      const paths = aiFieldPaths(name);

      for (const path of [paths.status, paths.error]) {
        const uses = topLevelNames.filter((topLevelName) => topLevelName === path).length;

        if (uses > 1) throw fail(`"${path}" is already used by another field`);
      }

      graph.set(
        name,
        kind.inputs.filter((input) => aiNames.has(input)),
      );
    }

    const cycle = findCycle(graph);

    if (cycle) {
      throw new Error(
        `[frogbot] aiField "${cycle[0]}" in collection "${collection.slug}": AI fields form a cycle: ${cycle.join(' → ')}`,
      );
    }
  }
}

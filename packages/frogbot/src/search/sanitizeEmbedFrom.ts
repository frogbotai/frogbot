import { getConfiguredEmbeddingModelIds, getConfiguredModelIds } from '../ai/models.js';
import type { AIConfig } from '../ai/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { ValidationMode } from '../config/validationContext.js';
import type { Block, Field } from '../fields/config/types.js';
import { getEmbedFromOptions } from './embedFrom.js';

export type SanitizeEmbedFromArgs = {
  ai: AIConfig | undefined;
  blocks?: Block[];
  collections: CollectionConfig[];
  mode: ValidationMode;
};

type Scope = { localized: boolean; owner: string; parent: string };

type Level = { fields: Field[]; localized: boolean; name: string };

const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'code']);

function fieldName(field: Field): string | undefined {
  const name = 'name' in field ? field.name : undefined;

  return typeof name === 'string' && name !== '' ? name : undefined;
}

function isLocalized(entry: unknown): boolean {
  return Boolean((entry as { localized?: unknown }).localized);
}

function joinPath(parent: string, name: string): string {
  return [parent, name].filter(Boolean).join('.');
}

function dataLevel(fields: readonly Field[]): { fields: Field[]; tabs: Level[] } {
  const level: { fields: Field[]; tabs: Level[] } = { fields: [], tabs: [] };

  for (const field of fields) {
    if (
      field.type === 'row' ||
      field.type === 'collapsible' ||
      (field.type === 'group' && !fieldName(field))
    ) {
      const inner = dataLevel(field.fields);

      level.fields.push(...inner.fields);
      level.tabs.push(...inner.tabs);
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          level.tabs.push({ fields: tab.fields, localized: isLocalized(tab), name: tab.name });
        } else {
          const inner = dataLevel(tab.fields);

          level.fields.push(...inner.fields);
          level.tabs.push(...inner.tabs);
        }
      }
    } else {
      level.fields.push(field);
    }
  }

  return level;
}

function childLevels(field: Field, path: string): Level[] {
  const localized = isLocalized(field);

  if (field.type === 'blocks') {
    return field.blocks
      .filter((block) => typeof block !== 'string')
      .map((block) => ({ fields: block.fields, localized, name: joinPath(path, block.slug) }));
  }

  if ((field.type === 'group' || field.type === 'array') && Array.isArray(field.fields)) {
    return [{ fields: field.fields, localized, name: path }];
  }

  return [];
}

export function sanitizeEmbedFrom({
  ai,
  blocks = [],
  collections,
  mode,
}: SanitizeEmbedFromArgs): void {
  const configuredModels = new Set(getConfiguredModelIds(ai));
  const embeddingModels = new Set(getConfiguredEmbeddingModelIds(ai));

  const modelProblem = (model: string): string | undefined => {
    const target = ai?.routers?.[model]?.model;

    if (!configuredModels.has(model) || (target !== undefined && !configuredModels.has(target))) {
      return `model '${model}' is not configured`;
    }

    return embeddingModels.has(model) ? undefined : `model '${model}' is not an embedding model`;
  };

  const checkField = (field: Field, siblings: Field[], path: string, scope: Scope): void => {
    const hooks = ('hooks' in field ? field.hooks : undefined) as
      Record<string, unknown[] | undefined> | undefined;

    for (const [phase, list] of Object.entries(hooks ?? {})) {
      for (const hook of list ?? []) {
        const options = getEmbedFromOptions(hook);

        if (!options) continue;

        const message = (problem: string) =>
          `[frogbot] embedFrom on field "${path}" in ${scope.owner}: ${problem}`;

        const fail = (problem: string) => new Error(message(problem));

        if (phase !== 'beforeChange') throw fail('it must be in `hooks.beforeChange`');

        if (field.type !== 'vector') throw fail('it must be on a vector field');

        const problem = modelProblem(options.model);

        if (problem) {
          if (mode === 'runtime') throw fail(problem);

          // eslint-disable-next-line no-console -- build-time config warnings go to the terminal
          console.warn(message(problem));
        }

        for (const name of options.fields ?? []) {
          const source = siblings.find((sibling) => fieldName(sibling) === name);

          if (!source) throw fail(`source "${name}" is not a sibling field`);

          if (!TEXT_TYPES.has(source.type)) {
            throw fail(`source "${name}" must be a text, textarea, email or code field`);
          }

          if ((source as { hasMany?: unknown }).hasMany) {
            throw fail(`source "${name}" must hold one string, not \`hasMany\``);
          }

          if (isLocalized(source) && !(isLocalized(field) || scope.localized)) {
            throw fail(`source "${name}" is localized, so the vector field must be localized too`);
          }
        }
      }
    }
  };

  const walk = (fields: readonly Field[], scope: Scope): void => {
    const level = dataLevel(fields);

    for (const field of level.fields) {
      const name = fieldName(field);
      const path = name ? joinPath(scope.parent, name) : scope.parent;

      checkField(field, level.fields, path, scope);

      for (const child of childLevels(field, path)) {
        walk(child.fields, {
          localized: scope.localized || child.localized,
          owner: scope.owner,
          parent: child.name,
        });
      }
    }

    for (const tab of level.tabs) {
      walk(tab.fields, {
        localized: scope.localized || tab.localized,
        owner: scope.owner,
        parent: joinPath(scope.parent, tab.name),
      });
    }
  };

  for (const collection of collections) {
    const hooks = Object.values(collection.hooks ?? {}).flatMap((list: unknown) =>
      Array.isArray(list) ? list : [],
    );

    if (hooks.some((hook) => getEmbedFromOptions(hook))) {
      throw new Error(
        `[frogbot] embedFrom in collection "${collection.slug}" hooks: it must be in a vector field's \`hooks.beforeChange\``,
      );
    }

    walk(collection.fields, {
      localized: false,
      owner: `collection "${collection.slug}"`,
      parent: '',
    });
  }

  for (const block of blocks) {
    walk(block.fields, { localized: false, owner: `block "${block.slug}"`, parent: '' });
  }
}

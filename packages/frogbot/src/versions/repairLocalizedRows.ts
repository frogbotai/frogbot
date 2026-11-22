import type {
  Block,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionConfig,
  Field,
  FlattenedBlock,
  PayloadRequest,
} from 'payload';

import { isRecord } from '../utilities/isRecord.js';

type Blocks = readonly (Block | FlattenedBlock)[];

type Data = Record<string, unknown>;

type BlockRef = Block | FlattenedBlock | string;

function blockFields(blocks: readonly BlockRef[], refs: Blocks, slug?: unknown): Field[][] {
  return blocks.flatMap((entry) => {
    const block = typeof entry === 'string' ? refs.find((ref) => ref.slug === entry) : entry;

    return block && (slug === undefined || block.slug === slug) ? [block.fields] : [];
  });
}

function rowFields(field: Field, refs: Blocks): Field[][] {
  if (field.type === 'array') return [field.fields];

  if (field.type === 'blocks') return blockFields(field.blocks, refs);

  return [];
}

function hasLocalized(fields: readonly Field[], refs: Blocks, seen: Set<Field>): boolean {
  return fields.some((field) => {
    if (seen.has(field)) return false;
    seen.add(field);

    if ('localized' in field && field.localized) return true;

    if (field.type === 'tabs') {
      return field.tabs.some((tab) => hasLocalized(tab.fields, refs, seen));
    }

    if ('fields' in field) return hasLocalized(field.fields, refs, seen);

    return rowFields(field, refs).some((nested) => hasLocalized(nested, refs, seen));
  });
}

function hasRowWithLocalized(fields: readonly Field[], refs: Blocks, seen: Set<Field>): boolean {
  return fields.some((field) => {
    if ('localized' in field && field.localized) return false;

    if (field.type === 'tabs') {
      return field.tabs.some((tab) => hasRowWithLocalized(tab.fields, refs, seen));
    }

    if (field.type === 'array' || field.type === 'blocks') {
      return rowFields(field, refs).some((nested) => hasLocalized(nested, refs, seen));
    }

    return 'fields' in field && hasRowWithLocalized(field.fields, refs, seen);
  });
}

/**
 * Whether a collection can hit Payload's position pairing on single-locale
 * publishes: it has drafts and a localized field inside a non-localized array
 * or blocks field. Call only for apps with localization.
 */
export function needsLocalizedRowRepair(collection: CollectionConfig, blocks: Blocks): boolean {
  const versions = collection.versions;

  if (!isRecord(versions) || !versions.drafts) return false;

  return hasRowWithLocalized(collection.fields, blocks, new Set());
}

type RepairArgs = {
  fields: readonly Field[];
  blocks: Blocks;
  locales: readonly string[];
  sent: ReadonlySet<string>;
};

function repairValue(value: unknown, before: unknown, locales: readonly string[]): unknown {
  if (value !== undefined && !isRecord(value)) return value;

  const out: Data = { ...(isRecord(value) ? value : {}) };

  for (const locale of locales) {
    const restored = isRecord(before) ? before[locale] : undefined;

    if (restored === undefined) delete out[locale];
    else out[locale] = restored;
  }

  return value === undefined && !Object.keys(out).length ? undefined : out;
}

function repairRows(rows: unknown, beforeRows: unknown, field: Field, args: RepairArgs): unknown {
  if (!Array.isArray(rows)) return rows;

  const previous = new Map<unknown, unknown>(
    (Array.isArray(beforeRows) ? beforeRows : []).flatMap((row) =>
      isRecord(row) && row.id != null ? [[String(row.id), row]] : [],
    ),
  );

  return rows.map((row) => {
    if (!isRecord(row)) return row;

    const fieldSets =
      field.type === 'blocks'
        ? blockFields(field.blocks, args.blocks, row.blockType)
        : rowFields(field, args.blocks);

    const id = row.id == null ? undefined : String(row.id);
    const before = id === undefined ? undefined : previous.get(id);

    if (!before && (id === undefined || !args.sent.has(id))) return row;

    return fieldSets.reduce<Data>(
      (acc, fields) => repairLevel(acc, isRecord(before) ? before : undefined, fields, args, true),
      row,
    );
  });
}

function repairLevel(
  data: Data,
  before: Data | undefined,
  fields: readonly Field[],
  args: RepairArgs,
  inRow: boolean,
): Data {
  let out = data;

  const set = (name: string, next: unknown) => {
    if (next === out[name]) return;
    out = out === data ? { ...data } : out;
    out[name] = next;
  };

  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          const value = out[tab.name];

          if (tab.localized) {
            if (inRow) set(tab.name, repairValue(value, before?.[tab.name], args.locales));
          } else if (isRecord(value)) {
            const nested = before?.[tab.name];

            set(
              tab.name,
              repairLevel(value, isRecord(nested) ? nested : undefined, tab.fields, args, inRow),
            );
          }
        } else {
          out = repairLevel(out, before, tab.fields, args, inRow);
        }
      }

      continue;
    }

    if (!('name' in field) || !field.name) {
      if ('fields' in field) out = repairLevel(out, before, field.fields, args, inRow);
      continue;
    }

    const { name } = field;

    if ('localized' in field && field.localized) {
      if (inRow) set(name, repairValue(out[name], before?.[name], args.locales));
      continue;
    }

    if (!(name in out)) continue;

    if (field.type === 'array' || field.type === 'blocks') {
      set(name, repairRows(out[name], before?.[name], field, args));
      continue;
    }

    if (field.type === 'group' && isRecord(out[name])) {
      const nested = before?.[name];

      set(
        name,
        repairLevel(out[name], isRecord(nested) ? nested : undefined, field.fields, args, inRow),
      );
    }
  }

  return out;
}

/**
 * Re-pairs the other locales' values inside non-localized array and blocks
 * rows by row `id`. `after` is the main row as Payload wrote it on a
 * single-locale publish, `before` the main row before that write, both read
 * with `locale: 'all'`. `locales` are the locales to restore from `before`:
 * the ones Payload kept, other than the saved one. A row with no match in
 * `before` gets none of them when its id is in `sent`, the row ids the caller
 * sent; a row Payload gave an id is left as Payload wrote it. Returns the
 * changed top-level fields, or `null`.
 *
 * Works around https://github.com/frogbotai/frogbot/issues/579 (Payload's
 * `mergeLocalizedData` pairs rows by position). Delete with its hooks once
 * Payload pairs them by id.
 */
export function repairLocalizedRows({
  after,
  before,
  ...args
}: RepairArgs & { after: Data; before: Data }): Data | null {
  const repaired = repairLevel(after, before, args.fields, args, false);

  const changed = Object.fromEntries(
    Object.entries(repaired).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(after[key]),
    ),
  );

  return Object.keys(changed).length ? changed : null;
}

function mainLocalized(fields: readonly Field[], refs: Blocks): boolean {
  return fields.some((field) => {
    if (field.type === 'array' || field.type === 'blocks') return false;

    if ('localized' in field && field.localized) return true;

    if (field.type === 'tabs') return field.tabs.some((tab) => mainLocalized(tab.fields, refs));

    return 'fields' in field && mainLocalized(field.fields, refs);
  });
}

function mainLocalizedKeys(fields: readonly Field[], refs: Blocks): string[] {
  return fields.flatMap((field) => {
    if (field.type === 'tabs') {
      return field.tabs.flatMap((tab) => {
        if (!('name' in tab) || !tab.name) return mainLocalizedKeys(tab.fields, refs);

        return tab.localized || mainLocalized(tab.fields, refs) ? [tab.name] : [];
      });
    }

    if (!('name' in field) || !field.name) {
      return 'fields' in field ? mainLocalizedKeys(field.fields, refs) : [];
    }

    return mainLocalized([field], refs) ? [field.name] : [];
  });
}

function rowIds(value: unknown, ids: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isRecord(entry) && (typeof entry.id === 'string' || typeof entry.id === 'number')) {
        ids.add(String(entry.id));
      }

      rowIds(entry, ids);
    }
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) rowIds(entry, ids);
  }

  return ids;
}

type Publish = { before: Map<string, Data>; sent: Set<string> };

const states = new WeakMap<PayloadRequest, Map<string, Publish>>();

function stateFor(req: PayloadRequest): Map<string, Publish> {
  let state = states.get(req);

  if (!state) {
    state = new Map();
    states.set(req, state);
  }

  return state;
}

const truthy = (value: unknown) => value === true || value === 'true';

const markPublish: CollectionBeforeOperationHook = ({ args, collection, operation, req }) => {
  if (operation !== 'update') return args;

  const options: Data = isRecord(args) ? args : {};
  const data = isRecord(options.data) ? options.data : {};
  const locale = options.locale ?? req.locale;
  const draft = truthy(options.draft);
  const savingDraft = draft && data._status !== 'published';
  const allLocales =
    (truthy(options.publishAllLocales) && !draft) || truthy(options.unpublishAllLocales);

  const singleLocale = typeof locale === 'string' && locale !== 'all';
  const state = stateFor(req);

  if (!savingDraft && !allLocales && singleLocale) {
    state.set(collection.slug, { before: new Map(), sent: rowIds(data, new Set()) });
  } else {
    state.delete(collection.slug);
  }

  return args;
};

const mainRow = async (req: PayloadRequest, collection: string, id: number | string) =>
  (await req.payload.db.findOne<Data & { id: number | string }>({
    collection,
    locale: 'all',
    req,
    where: { id: { equals: id } },
  })) ?? undefined;

const keepBefore: CollectionBeforeChangeHook = async ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  const id = isRecord(originalDoc) ? originalDoc.id : undefined;

  if (operation !== 'update' || (typeof id !== 'string' && typeof id !== 'number')) return data;

  const publish = states.get(req)?.get(collection.slug);

  if (!publish) return data;

  const before = await mainRow(req, collection.slug, id);

  if (before) publish.before.set(String(id), before);

  return data;
};

function keptLocales(before: Data, after: Data, locale: string, all: readonly string[]): string[] {
  const statusBefore = isRecord(before._status) ? before._status : {};
  const statusAfter = isRecord(after._status) ? after._status : {};
  const kept =
    statusAfter[locale] === 'published'
      ? Object.keys(statusBefore).filter((code) => statusBefore[code] === 'published')
      : all;

  return kept.filter((code) => code !== locale);
}

const repairAfter: CollectionAfterChangeHook = async ({ collection, doc, operation, req }) => {
  const id = isRecord(doc) ? doc.id : undefined;

  if (operation !== 'update' || (typeof id !== 'string' && typeof id !== 'number')) return doc;

  const publish = states.get(req)?.get(collection.slug);
  const before = publish?.before.get(String(id));
  const { localization } = req.payload.config;
  const locale = req.locale;

  publish?.before.delete(String(id));

  if (!publish || !before || !localization || !locale || locale === 'all') return doc;

  const after = await mainRow(req, collection.slug, id);

  if (!after) return doc;

  const blocks = req.payload.config.blocks ?? [];
  const changed = repairLocalizedRows({
    after,
    before,
    blocks,
    fields: collection.fields,
    locales: keptLocales(before, after, locale, localization.localeCodes),
    sent: publish.sent,
  });

  if (!changed) return doc;

  const mainKeys = [...mainLocalizedKeys(collection.fields, blocks), '_status'];
  const data = mainKeys.some((key) => key in changed)
    ? {
        ...Object.fromEntries(
          mainKeys.filter((key) => key in after).map((key) => [key, after[key]]),
        ),
        ...changed,
      }
    : changed;

  await req.payload.db.updateOne({ id, collection: collection.slug, data, locale, req });

  return doc;
};

/**
 * Adds the hooks that undo Payload's position pairing of localized values
 * inside array and blocks rows on single-locale publishes, to the collections
 * that can hit it. Delete once Payload pairs by id: see
 * https://github.com/frogbotai/frogbot/issues/579.
 */
export function withLocalizedRowRepair(
  collection: CollectionConfig,
  blocks: Blocks,
): CollectionConfig {
  if (!needsLocalizedRowRepair(collection, blocks)) return collection;

  const hooks = collection.hooks ?? {};

  return {
    ...collection,
    hooks: {
      ...hooks,
      beforeOperation: [...(hooks.beforeOperation ?? []), markPublish],
      beforeChange: [...(hooks.beforeChange ?? []), keepBefore],
      afterChange: [repairAfter, ...(hooks.afterChange ?? [])],
    },
  };
}

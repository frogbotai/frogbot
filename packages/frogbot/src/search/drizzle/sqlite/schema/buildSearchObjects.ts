import type {
  SearchColumn,
  SearchObject,
  SearchObjectGroup,
  SearchRowKey,
  SearchTarget,
} from '../types.js';

type Rows = { locales: string; table: string };

type Source = 'locales' | 'table';

type TriggerEvent = 'delete' | 'insert' | 'update';

type TriggerBodies = Record<TriggerEvent, string[]>;

type Component = {
  columns: string[];
  condition?: (rows: Rows) => string;
  key: SearchRowKey;
  keyColumn: string;
  table: string;
  values: (rows: Rows) => string[];
  watch: SearchColumn[];
};

type Sync = {
  populate: string;
  triggers: Partial<Record<Source, Partial<TriggerBodies>>>;
  watch: Partial<Record<Source, string[]>>;
};

export function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function column(rows: Rows, { localized, name }: SearchColumn): string {
  return `${localized ? rows.locales : rows.table}.${quote(name)}`;
}

function getLexicalComponent({ lexical }: SearchTarget): Component | undefined {
  if (!lexical) return undefined;

  return {
    columns: lexical.columns.map(({ name }) => quote(name)),
    key: lexical.key,
    keyColumn: 'rowid',
    table: lexical.table,
    values: (rows) => lexical.columns.map((item) => column(rows, item)),
    watch: lexical.columns,
  };
}

function getVectorComponent({ vector }: SearchTarget): Component | undefined {
  if (!vector?.index) return undefined;

  return {
    columns: ['"embedding"'],
    condition: (rows) =>
      `${column(rows, vector)} IS NOT NULL AND json_array_length(${column(rows, vector)}) = ${vector.dimensions}`,
    key: vector.index.key,
    keyColumn: '"id"',
    table: vector.index.table,
    values: (rows) => [`vector32(${column(rows, vector)})`],
    watch: [vector],
  };
}

function buildSync(component: Component, target: SearchTarget): Sync | undefined {
  const into = `INSERT INTO ${quote(component.table)} (${component.keyColumn}, ${component.columns.join(', ')})`;
  const source = quote(target.table);

  const select = (key: string, rows: Rows, from: string, clauses: string[] = []) => {
    const conditions = [...clauses, ...(component.condition ? [component.condition(rows)] : [])];
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    return `${into} SELECT ${key}, ${component.values(rows).join(', ')}${from}${where}`;
  };

  const remove = (key: string) =>
    `DELETE FROM ${quote(component.table)} WHERE ${component.keyColumn} = ${key};`;

  if (component.key === 'table') {
    const insert = `${select('new."id"', { locales: 'new', table: 'new' }, '')};`;

    return {
      populate: select('s."id"', { locales: 's', table: 's' }, ` FROM ${source} s`),
      triggers: {
        table: {
          delete: [remove('old."id"')],
          insert: [insert],
          update: [remove('old."id"'), insert],
        },
      },
      watch: { table: component.watch.map(({ name }) => name) },
    };
  }

  if (component.key === 'keys' && target.keys) {
    const keys = quote(target.keys);
    const key = `(SELECT "id" FROM ${keys} WHERE "parent" = old."id")`;
    const rows = { locales: 'new', table: 'new' };
    const insert = `${select('k."id"', rows, ` FROM ${keys} k`, ['k."parent" = new."id"'])};`;

    return {
      populate: select(
        'k."id"',
        { locales: 's', table: 's' },
        ` FROM ${keys} k JOIN ${source} s ON s."id" = k."parent"`,
      ),
      triggers: {
        table: {
          delete: [remove(key)],
          insert: [insert],
          update: [remove(key), insert],
        },
      },
      watch: { table: component.watch.map(({ name }) => name) },
    };
  }

  if (component.key !== 'locales' || !target.locales) return undefined;

  const locales = quote(target.locales.table);
  const parent = quote(target.locales.parent);
  const children = `DELETE FROM ${quote(component.table)} WHERE ${component.keyColumn} IN (SELECT "id" FROM ${locales} WHERE ${parent} = old."id");`;
  const shared = component.watch.filter(({ localized }) => !localized).map(({ name }) => name);

  const insert = `${select('new."id"', { locales: 'new', table: 's' }, ` FROM ${source} s`, [
    `s."id" = new.${parent}`,
  ])};`;

  const reinsert = `${select('l."id"', { locales: 'l', table: 'new' }, ` FROM ${locales} l`, [
    `l.${parent} = new."id"`,
  ])};`;

  return {
    populate: select(
      'l."id"',
      { locales: 'l', table: 's' },
      ` FROM ${locales} l JOIN ${source} s ON s."id" = l.${parent}`,
    ),
    triggers: {
      locales: {
        delete: [remove('old."id"')],
        insert: [insert],
        update: [remove('old."id"'), insert],
      },
      table: {
        delete: [children],
        ...(shared.length ? { update: [children, reinsert] } : {}),
      },
    },
    watch: {
      locales: component.watch.filter(({ localized }) => localized).map(({ name }) => name),
      table: shared,
    },
  };
}

function buildTableObjects(target: SearchTarget): SearchObject[] {
  const { keys, lexical, vector } = target;
  const objects: SearchObject[] = [];

  if (keys) {
    objects.push({
      name: keys,
      sql: `CREATE TABLE ${quote(keys)} ("id" integer PRIMARY KEY, "parent" text NOT NULL UNIQUE)`,
      type: 'table',
    });
  }

  if (lexical) {
    const columns = lexical.columns.map(({ name }) => quote(name)).join(', ');

    objects.push({
      name: lexical.table,
      sql: `CREATE VIRTUAL TABLE ${quote(lexical.table)} USING fts5(${columns}, tokenize = '${lexical.tokenize}')`,
      type: 'table',
    });
  }

  if (vector?.index) {
    const metric = vector.metric === 'euclidean' ? 'l2' : 'cosine';

    objects.push(
      {
        name: vector.index.table,
        sql: `CREATE TABLE ${quote(vector.index.table)} ("id" integer PRIMARY KEY, "embedding" F32_BLOB(${vector.dimensions}) NOT NULL)`,
        type: 'table',
      },
      {
        name: vector.index.name,
        sql: `CREATE INDEX ${quote(vector.index.name)} ON ${quote(vector.index.table)} (libsql_vector_idx("embedding", 'metric=${metric}'))`,
        type: 'index',
      },
    );
  }

  return objects;
}

export function buildSearchObjects(target: SearchTarget): SearchObjectGroup | undefined {
  const syncs = [getLexicalComponent(target), getVectorComponent(target)].flatMap((component) => {
    const sync = component && buildSync(component, target);

    return sync ? [sync] : [];
  });

  if (!syncs.length) return undefined;

  const keys = target.keys ? quote(target.keys) : undefined;

  const sources: [Source, string][] = [
    ['table', target.table],
    ...(target.locales ? [['locales', target.locales.table] as [Source, string]] : []),
  ];

  const triggers: SearchObject[] = [];

  for (const [source, table] of sources) {
    const watch = [...new Set(syncs.flatMap((sync) => sync.watch[source] ?? []))];

    for (const event of ['insert', 'update', 'delete'] as const) {
      const body = syncs.flatMap((sync) => sync.triggers[source]?.[event] ?? []);

      if (!body.length || (event === 'update' && !watch.length)) continue;

      if (keys && source === 'table' && event === 'insert') {
        body.unshift(`INSERT INTO ${keys} ("parent") VALUES (new."id");`);
      }

      if (keys && source === 'table' && event === 'delete') {
        body.push(`DELETE FROM ${keys} WHERE "parent" = old."id";`);
      }

      const name = `${target.name}${source === 'locales' ? '_locales' : ''}_${event}`;

      const timing =
        event === 'update'
          ? `AFTER UPDATE OF ${watch.map(quote).join(', ')}`
          : `AFTER ${event.toUpperCase()}`;

      triggers.push({
        name,
        sql: `CREATE TRIGGER ${quote(name)} ${timing} ON ${quote(table)} BEGIN ${body.join(' ')} END`,
        type: 'trigger',
      });
    }
  }

  return {
    objects: [...buildTableObjects(target), ...triggers],
    populate: [
      ...(keys ? [`INSERT INTO ${keys} ("parent") SELECT "id" FROM ${quote(target.table)}`] : []),
      ...syncs.map(({ populate }) => populate),
    ],
    tables: sources.map(([, table]) => table),
  };
}

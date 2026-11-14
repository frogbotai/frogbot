import { type LiveSchema, quote } from './live.js';

const addEnumValue =
  /^\s*ALTER\s+TYPE\s+(?:"(?:[^"]|"")+"\.)?"((?:[^"]|"")+)"\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'((?:[^']|'')*)'/i;

const tableOf =
  /^\s*(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE)\s+(?:"(?:[^"]|"")+"\.)?"((?:[^"]|"")+)"/i;

const setDefault =
  /^\s*ALTER\s+TABLE\s+(?:"(?:[^"]|"")+"\.)?"((?:[^"]|"")+)"\s+ALTER\s+COLUMN\s+"((?:[^"]|"")+)"\s+SET\s+DEFAULT\s+'((?:[^']|'')*)'/i;

const setNotNull =
  /^\s*ALTER\s+TABLE\s+(?:"(?:[^"]|"")+"\.)?"((?:[^"]|"")+)"\s+ALTER\s+COLUMN\s+"((?:[^"]|"")+)"\s+SET\s+NOT\s+NULL/i;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const unquote = (name: string) => name.replaceAll('""', '"');

/** The enum value an `ALTER TYPE … ADD VALUE` statement adds, with its type's name; none for any other statement. */
export function addedEnumValue(statement: string): { type: string; value: string } | undefined {
  const match = addEnumValue.exec(statement);

  return match ? { type: unquote(match[1]), value: match[2].replaceAll("''", "'") } : undefined;
}

/**
 * Splits off what Postgres can't run in the transaction that adds an enum value: a column default set to
 * a value `added` holds for that column's type. A new column is added without the default (and without
 * NOT NULL) now, so its indexes and the rest of the push still run; `later` sets the default, fills the
 * existing rows with it as `ADD COLUMN … DEFAULT` would have, and sets NOT NULL again. Values are matched
 * on the enum type the `ADD VALUE` touched, so the same string in another enum stays put. `deferred` holds
 * the `table.column`s already split off across push passes, so a later pass's `SET DEFAULT` or
 * `SET NOT NULL` for one goes nowhere.
 */
export function splitNewEnumDefaults(
  statements: string[],
  added: Map<string, Set<string>>,
  deferred: Set<string>,
  live: LiveSchema,
): { now: string[]; later: string[] } {
  const now: string[] = [];
  const later: string[] = [];

  for (const statement of statements) {
    if (addEnumValue.test(statement)) {
      now.push(statement);
      continue;
    }

    const notNull = setNotNull.exec(statement);

    if (notNull && deferred.has(`${unquote(notNull[1])}.${unquote(notNull[2])}`)) continue;

    const set = setDefault.exec(statement);

    if (set) {
      const [, table, column, value] = set;
      const key = `${unquote(table)}.${unquote(column)}`;
      const udt = live
        .get(unquote(table))
        ?.columns.find((each) => each.name === unquote(column))?.udt;

      if (deferred.has(key)) continue;

      if (udt && added.get(udt)?.has(value.replaceAll("''", "'"))) {
        deferred.add(key);
        later.push(statement);
        continue;
      }
    }

    const table = tableOf.exec(statement)?.[1];
    let rewritten = statement;

    for (const [type, values] of added) {
      const column = new RegExp(
        `"((?:[^"]|"")+)"\\s+((?:"(?:[^"]|"")+"\\.)?"${escape(type.replaceAll('"', '""'))}")\\s+DEFAULT\\s+'((?:[^']|'')*)'(\\s+NOT\\s+NULL)?`,
        'gi',
      );

      rewritten = rewritten.replace(
        column,
        (whole, name: string, typeName: string, value: string, notNull?: string) => {
          if (!table || !values.has(value.replaceAll("''", "'"))) return whole;

          const target = `ALTER TABLE ${quote(unquote(table))} ALTER COLUMN "${name}"`;
          const created = /^\s*CREATE\s+TABLE/i.test(statement);

          deferred.add(`${unquote(table)}.${unquote(name)}`);
          later.push(`${target} SET DEFAULT '${value}';`);

          if (created) return `"${name}" ${typeName}${notNull ?? ''}`;

          later.push(
            `UPDATE ${quote(unquote(table))} SET "${name}" = DEFAULT WHERE "${name}" IS NULL;`,
          );

          if (notNull) later.push(`${target} SET NOT NULL;`);

          return `"${name}" ${typeName}`;
        },
      );
    }

    now.push(rewritten);
  }

  return { now, later };
}

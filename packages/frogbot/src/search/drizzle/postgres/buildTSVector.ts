import { type SQL, sql, type SQLWrapper } from 'drizzle-orm';

export function getTextSearchConfig(language: string | undefined): SQL {
  return sql.raw(`'${language ?? 'simple'}'::regconfig`);
}

export function buildTSVector({
  columns,
  language,
}: {
  columns: SQLWrapper[];
  language: string | undefined;
}): SQL {
  return sql`to_tsvector(${getTextSearchConfig(language)}, ${sql.join(
    columns.map((column) => sql`coalesce(${column}, '')`),
    sql` || ' ' || `,
  )})`;
}

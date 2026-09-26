import type { SearchObjectGroup } from '../types.js';
import { quote } from './buildSearchObjects.js';

export type SearchObjectRow = {
  name: string;
  sql: null | string;
  tbl_name: string;
  type: string;
};

export function getCreateStatements(group: SearchObjectGroup): string[] {
  return [...group.objects.map(({ sql }) => sql), ...group.populate];
}

export function getDropStatements(
  rows: Pick<SearchObjectRow, 'name' | 'sql' | 'type'>[],
): string[] {
  const tables = rows
    .filter(({ type }) => type === 'table')
    .sort(
      (a, b) =>
        Number(!a.sql?.startsWith('CREATE VIRTUAL TABLE')) -
          Number(!b.sql?.startsWith('CREATE VIRTUAL TABLE')) || a.name.length - b.name.length,
    );

  return [
    ...rows
      .filter(({ type }) => type === 'trigger')
      .map(({ name }) => `DROP TRIGGER IF EXISTS ${quote(name)}`),
    ...tables.map(({ name }) => `DROP TABLE IF EXISTS ${quote(name)}`),
  ];
}

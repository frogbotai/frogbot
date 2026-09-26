import type { RequireDrizzleKit } from '@payloadcms/drizzle';

import type { SearchObjectGroup, SearchSchema } from '../types.js';
import { getCreateStatements, getDropStatements } from './statements.js';

type DrizzleSnapshotJSON = Parameters<ReturnType<RequireDrizzleKit>['generateMigration']>[0];

type SearchSnapshot = DrizzleSnapshotJSON & { frogbot?: { search?: SearchSchema } };

export function addSearchSnapshot(
  snapshot: DrizzleSnapshotJSON,
  search: SearchSchema,
): DrizzleSnapshotJSON {
  return Object.keys(search).length
    ? ({ ...snapshot, frogbot: { search } } as SearchSnapshot)
    : snapshot;
}

export function splitSearchSnapshot(
  snapshot: DrizzleSnapshotJSON,
): [snapshot: DrizzleSnapshotJSON, search: SearchSchema] {
  const { frogbot, ...rest } = snapshot as SearchSnapshot;

  return [rest as DrizzleSnapshotJSON, frogbot?.search ?? {}];
}

export function getSearchMigration({
  next,
  previous,
  statements,
}: {
  next: SearchSchema;
  previous: SearchSchema;
  statements: string[];
}): string[] {
  const touches = ({ tables }: SearchObjectGroup) =>
    tables.some((table) => statements.some((statement) => statement.includes(`\`${table}\``)));

  const rebuilds = (name: string, group: SearchObjectGroup) =>
    JSON.stringify(previous[name]) !== JSON.stringify(next[name]) || touches(group);

  return [
    ...Object.entries(previous)
      .filter(([name, group]) => rebuilds(name, group))
      .flatMap(([, group]) => getDropStatements(group.objects)),
    ...statements,
    ...Object.entries(next)
      .filter(([name, group]) => rebuilds(name, group))
      .flatMap(([, group]) => getCreateStatements(group)),
  ];
}

import { renderTable } from '@payloadcms/ui/rsc';
import type {
  ClientCollectionConfig,
  ColumnPreference,
  PaginatedDocs,
  PayloadRequest,
  SanitizedCollectionConfig,
  SanitizedFieldsPermissions,
  ViewTypes,
  Where,
} from 'payload';
import { combineWhereConstraints, mergeListSearchAndWhere } from 'payload/shared';
import { isValidElement, type ReactNode } from 'react';

import { canCreateField } from '../Board/inlineAdd.js';
import { setPath } from '../cells.js';
import { buildGroupWhere } from '../groups/keys.js';
import { type CountedGroup, getGroupPage, layoutGroups } from '../groups/layout.js';
import {
  hasFixedGroups,
  resolveGroupField,
  resolveGroups,
  resolveStrayGroups,
} from '../groups/resolve.js';
import { GroupSection } from './GroupSection.client.js';
import { withRowIds } from './rowIds.js';

type Row = Record<string, unknown>;

function findTable(node: ReactNode): ReactNode {
  if (!isValidElement<{ children?: ReactNode; columns?: unknown; data?: unknown }>(node)) {
    return undefined;
  }

  if (Array.isArray(node.props.columns) && Array.isArray(node.props.data)) return node;

  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];

  for (const child of children) {
    const table = findTable(child as ReactNode);
    if (table) return table;
  }

  return undefined;
}

function toPrefill(
  path: string,
  value: unknown,
  hasMany: boolean,
): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;

  return setPath(path, hasMany ? [value] : value);
}

export type GroupedTable = {
  docs: Row[];
  /** False when every group shows on one page, so the list's page controls stay hidden. */
  pagedGroups: boolean;
  Table: ReactNode[];
  totalDocs: number;
};

/**
 * The list's grouped body, rendered on the server: groups in the field's option order, each in
 * Payload's table section with FrogBot's header. Rows and counts come from the same query, the
 * latest draft where the collection has drafts, so a count always matches its rows. A collapsed
 * group renders its header only and loads no rows. Returns `undefined` for a field the list can't
 * group by, so Payload's own grouping renders.
 */
export async function renderGroupedTable({
  baseFilter,
  canCreate,
  clientCollectionConfig,
  collapsed,
  collectionConfig,
  columns,
  enableRowSelections,
  fieldPermissions,
  groupBy,
  limit,
  navigationLabel,
  preferenceKey,
  query,
  req,
  sort,
  viewType,
}: {
  baseFilter?: Where;
  canCreate: boolean;
  clientCollectionConfig: ClientCollectionConfig;
  collapsed: string[];
  collectionConfig: SanitizedCollectionConfig;
  columns: ColumnPreference[];
  enableRowSelections: boolean;
  fieldPermissions?: SanitizedFieldsPermissions;
  groupBy: string;
  limit: number;
  /** Turns on Payload's keyboard grid in each group's table. */
  navigationLabel?: string;
  /** The preference that keeps this view's collapsed groups. */
  preferenceKey: string;
  query: Record<string, unknown>;
  req: PayloadRequest;
  sort?: string;
  viewType?: ViewTypes;
}): Promise<GroupedTable | undefined> {
  const path = groupBy.replace(/^-/, '');
  const field = resolveGroupField(collectionConfig.fields, path);
  if (!field) return undefined;

  const collectionSlug = collectionConfig.slug;
  const where = mergeListSearchAndWhere({
    collectionConfig,
    search: typeof query.search === 'string' ? query.search : '',
    where: combineWhereConstraints([query.where as Where | undefined, baseFilter]),
  });

  const findRows = (groupWhere: Where, rows: { limit: number; page?: number }) =>
    req.payload.find({
      collection: collectionSlug,
      depth: 0,
      draft: true,
      fallbackLocale: false,
      includeLockStatus: true,
      locale: req.locale,
      overrideAccess: false,
      req,
      sort,
      user: req.user,
      where: groupWhere,
      ...rows,
    });

  const countRows = async (groupWhere: Where) =>
    (await findRows(groupWhere, { limit: 1 })).totalDocs;

  const fixed = hasFixedGroups(field);
  const draft = Boolean(collectionConfig.versions?.drafts);
  const [resolved, strays, noValueCount, totalDocs] = await Promise.all([
    resolveGroups({ collectionSlug, draft, field, path, req, where }),
    resolveStrayGroups({ collectionSlug, draft, field, path, req, where }),
    countRows(buildGroupWhere(where, path, null) as Where),
    countRows(where),
  ]);

  const layout = layoutGroups({
    descending: groupBy.startsWith('-'),
    fixed,
    groups: resolved,
    limit,
    noValueLabel: noValueCount > 0 ? req.i18n.t('general:noValue') : undefined,
    page: Number(query.page) || 1,
    strays,
  });

  const hasMany = 'hasMany' in field && field.hasMany === true;
  const canPrefill = canCreate && canCreateField(fieldPermissions, path.split('.'));

  const counted = await Promise.all(
    layout.groups.map(async (group) => {
      const isCollapsed = collapsed.includes(group.key);
      const groupWhere = buildGroupWhere(where, path, group.value) as Where;
      const data: PaginatedDocs | undefined = isCollapsed
        ? undefined
        : await findRows(groupWhere, {
            limit,
            page: getGroupPage(query.queryByGroup, group.key),
          });

      const count = data ? data.totalDocs : await countRows(groupWhere);

      return { data: count > 0 ? data : undefined, group: { ...group, count }, isCollapsed };
    }),
  );

  const docs: Row[] = [];
  const Table = counted
    .filter(({ group }) => group.keepEmpty || group.count > 0)
    .map(({ data, group, isCollapsed }) => {
      if (data) docs.push(...(data.docs as Row[]));

      return renderGroup({
        canCreate: group.value === null ? canCreate : canPrefill,
        clientCollectionConfig,
        collapsed: isCollapsed,
        collectionConfig,
        columns,
        data,
        enableRowSelections,
        fieldPermissions,
        group,
        groupBy,
        hasMany,
        path,
        navigationLabel,
        preferenceKey,
        req,
        viewType,
      });
    });

  return {
    docs,
    pagedGroups: !fixed && layout.totalPages > 1,
    Table,
    totalDocs,
  };
}

function renderGroup({
  canCreate,
  clientCollectionConfig,
  collapsed,
  collectionConfig,
  columns,
  data,
  enableRowSelections,
  fieldPermissions,
  group,
  groupBy,
  hasMany,
  path,
  navigationLabel,
  preferenceKey,
  req,
  viewType,
}: {
  canCreate: boolean;
  clientCollectionConfig: ClientCollectionConfig;
  collapsed: boolean;
  collectionConfig: SanitizedCollectionConfig;
  columns: ColumnPreference[];
  data?: PaginatedDocs;
  enableRowSelections: boolean;
  fieldPermissions?: SanitizedFieldsPermissions;
  group: CountedGroup;
  groupBy: string;
  hasMany: boolean;
  path: string;
  navigationLabel?: string;
  preferenceKey: string;
  req: PayloadRequest;
  viewType?: ViewTypes;
}): ReactNode {
  const collectionSlug = collectionConfig.slug;
  const tableId = `payload-table-${collectionSlug}-${encodeURIComponent(group.key)}`;
  const table = data
    ? findTable(
        renderTable({
          clientCollectionConfig,
          collectionConfig,
          columns,
          data,
          enableRowSelections,
          fieldPermissions,
          groupByFieldPath: path,
          groupByValue: group.key,
          heading: group.label,
          i18n: req.i18n,
          key: `table-${group.key}`,
          orderableFieldName: '',
          payload: req.payload,
          query: { groupBy },
          req,
          useAsTitle: collectionConfig.admin.useAsTitle,
          viewType,
        }).Table,
      )
    : undefined;

  return (
    <GroupSection
      canCreate={canCreate}
      collapsed={collapsed}
      collectionSlug={collectionSlug}
      color={group.color}
      count={group.count}
      data={data}
      groupKey={group.key}
      key={group.key}
      label={group.label}
      prefill={toPrefill(path, group.value, hasMany)}
      preferenceKey={preferenceKey}
      tableId={tableId}
      viewType={viewType}
      where={JSON.parse(JSON.stringify(buildGroupWhere(undefined, path, group.value)))}
    >
      {table ? withRowIds(table, navigationLabel) : null}
    </GroupSection>
  );
}

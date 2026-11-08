import { renderTable } from '@payloadcms/ui/rsc';
import type { CollectionSlug } from 'frogbot';
import { attachRegisteredFrogBot } from 'frogbot/internal';
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

import { setPath } from '../cells.js';
import { buildGroupWhere, toGroupCounts } from '../groups/keys.js';
import { getGroupPage, layoutGroups } from '../groups/layout.js';
import { hasFixedGroups, resolveGroupField, resolveGroups } from '../groups/resolve.js';
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
 * The list's grouped body, rendered on the server: groups in the field's option order with true
 * counts from one aggregate, each in Payload's table section with FrogBot's header. A collapsed
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

  const frogbotReq = attachRegisteredFrogBot(req);
  const [aggregate, resolved] = await Promise.all([
    frogbotReq.frogbot.aggregate({
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- CollectionSlug narrows to the app's slugs only where its generated types load
      collection: collectionSlug as CollectionSlug,
      draft: true,
      groupBy: path,
      overrideAccess: false,
      req: frogbotReq,
      values: { count: { count: true } },
      where,
    }),
    resolveGroups({ collectionSlug, field, path, req, where }),
  ]);

  const counts = toGroupCounts(aggregate.groups, path);
  const fixed = hasFixedGroups(field);
  const layout = layoutGroups({
    counts,
    descending: groupBy.startsWith('-'),
    fixed,
    groups: resolved,
    limit,
    noValueLabel: req.i18n.t('general:noValue'),
    page: Number(query.page) || 1,
  });

  const hasMany = 'hasMany' in field && field.hasMany === true;
  const docs: Row[] = [];

  const Table = await Promise.all(
    layout.groups.map(async (group) => {
      const isCollapsed = collapsed.includes(group.key);
      const groupWhere = buildGroupWhere(where, path, group.value) as Where;
      const data: PaginatedDocs | undefined =
        isCollapsed || group.count === 0
          ? undefined
          : await req.payload.find({
              collection: collectionSlug,
              depth: 0,
              draft: true,
              fallbackLocale: false,
              includeLockStatus: true,
              limit,
              locale: req.locale,
              overrideAccess: false,
              page: getGroupPage(query.queryByGroup, group.key),
              req,
              sort,
              user: req.user,
              where: groupWhere,
            });

      if (data) docs.push(...(data.docs as Row[]));

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
          collapsed={isCollapsed}
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
          {table ? withRowIds(table) : null}
        </GroupSection>
      );
    }),
  );

  return {
    docs,
    pagedGroups: !fixed && layout.totalPages > 1,
    Table,
    totalDocs: Object.values(counts).reduce((sum, count) => sum + count, 0),
  };
}

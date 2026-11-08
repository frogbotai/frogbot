import { getClientConfig } from '@payloadcms/ui/utilities/getClientConfig';
import { getSummaryKind, SUMMARY_OPERATIONS } from 'frogbot/internal';
import type {
  ListViewServerProps,
  PayloadRequest,
  SanitizedCollectionConfig,
  Where,
} from 'payload';
import { combineWhereConstraints, formatAdminURL, mergeListSearchAndWhere } from 'payload/shared';
import * as qs from 'qs-esm';

import { getPath } from '../cells.js';
import {
  createViewRequest,
  getRuntimeViews,
  redirectToLastView,
  resolveCollectionViews,
} from '../collectionViews.js';
import { buildFrameSlots } from '../frame.js';
import { selectPath } from '../groups/resolve.js';
import { redirectRecordParam } from '../panel/redirectRecord.js';
import { getGroupsPreferenceKey, resolveViewColumnPreferences } from '../preferences.js';
import { isRecordDone } from '../records/state.js';
import {
  isFreshQuery,
  pickViewSetup,
  readViewPreference,
  resolveViewSetup,
  type ViewSetup,
} from '../viewSetup.js';
import { DefaultListView } from './DefaultListView.client.js';
import { type GroupedTable, renderGroupedTable } from './groupedTable.js';
import { ListFrameClient, type ListFrameSummary } from './ListFrame.client.js';
import { withRowIds } from './rowIds.js';
import { readSummaryChoices, type SummaryColumn } from './summary/summary.js';

type Row = Record<string, unknown>;

async function findDoneIds({
  collectionSlug,
  docs,
  req,
  trash,
  useAsDone,
}: {
  collectionSlug: string;
  docs: Row[];
  req: PayloadRequest;
  trash: boolean;
  useAsDone: string | undefined;
}): Promise<string[] | undefined> {
  if (!useAsDone) return undefined;

  const unread = docs.filter((doc) => getPath(doc, useAsDone) === undefined).map((doc) => doc.id);
  const read = unread.length
    ? await req.payload.find({
        collection: collectionSlug,
        depth: 0,
        limit: unread.length,
        overrideAccess: false,
        pagination: false,
        req,
        select: selectPath(useAsDone),
        trash,
        where: { id: { in: unread } },
      })
    : { docs: [] };

  const doneElsewhere = new Set(
    (read.docs as Row[]).filter((doc) => isRecordDone(doc, useAsDone)).map((doc) => doc.id),
  );

  return docs
    .filter((doc) => isRecordDone(doc, useAsDone) || doneElsewhere.has(doc.id))
    .map((doc) => String(doc.id));
}

async function resolveSummaryProps({
  collectionConfig,
  columns,
  defaults,
  preference,
  preferenceKey,
  query,
  req,
}: {
  collectionConfig: SanitizedCollectionConfig;
  columns: string[];
  defaults: ListFrameSummary['defaults'];
  preference: unknown;
  preferenceKey: string;
  query: Record<string, unknown>;
  req: PayloadRequest;
}): Promise<ListFrameSummary> {
  const summaryColumns: Record<string, SummaryColumn> = {};

  for (const path of columns) {
    const kind = getSummaryKind({ collection: collectionConfig, path, payload: req.payload });

    if (kind) summaryColumns[path] = { kind, operations: SUMMARY_OPERATIONS[kind] };
  }

  const baseFilter = await collectionConfig.admin.baseFilter?.({
    limit: Number(query.limit) || collectionConfig.admin.pagination?.defaultLimit || 10,
    page: Number(query.page) || 1,
    req,
    sort: typeof query.sort === 'string' ? query.sort : '',
  });

  const where = mergeListSearchAndWhere({
    collectionConfig,
    search: typeof query.search === 'string' ? query.search : '',
    where: combineWhereConstraints([query.where as Where | undefined, baseFilter ?? undefined]),
  });

  return {
    columns: summaryColumns,
    defaults,
    preferenceKey,
    saved: readSummaryChoices(preference),
    where,
  };
}

function toKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
}

function withDefaultGroupBy(stored: ViewSetup, groupBy: string | undefined): ViewSetup {
  return groupBy && stored.groupBy === undefined ? { ...stored, groupBy } : stored;
}

/**
 * The list view Payload renders. On the collection's own page it renders in FrogBot's shared view
 * frame with Payload's table, selection and page controls as its body. A relationship drawer and
 * the hierarchy view stay Payload's own list.
 */
export async function ListView(props: ListViewServerProps) {
  const {
    collectionConfig,
    data,
    i18n,
    limit,
    listSearchableFields,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    server,
    user,
    ...clientProps
  } = props;

  const isPage = Array.isArray((params as { segments?: unknown } | undefined)?.segments);
  if (!isPage || clientProps.viewType === 'hierarchy') return <DefaultListView {...clientProps} />;

  const collectionSlug = collectionConfig.slug;
  const req = await createViewRequest({ i18n, payload, searchParams, user });
  const { views } = await resolveCollectionViews({ collectionConfig, req });
  const runtime = getRuntimeViews({ collectionConfig });
  const view = runtime[0]?.type === 'list' ? runtime[0] : undefined;
  const isList = clientProps.viewType === 'list' && view !== undefined;
  let summary: ListFrameSummary | undefined;

  redirectRecordParam({
    collectionConfig,
    record: req.query?.record,
    redirect: (path) =>
      server.redirect(formatAdminURL({ adminRoute: payload.config.routes.admin, path })),
  });

  let grouped: GroupedTable | undefined;

  if (isList) {
    await redirectToLastView({ collectionSlug, req, server, views });

    const query = req.query ?? {};
    const setup = await resolveViewSetup({
      collectionSlug,
      query,
      req,
      viewSlug: view.slug,
    });

    const stored = pickViewSetup(setup.preference);
    const saved = qs.stringify(withDefaultGroupBy(stored, view.groupBy));

    if (isFreshQuery(query) && saved) {
      server.redirect(
        `${formatAdminURL({
          adminRoute: payload.config.routes.admin,
          path: `/collections/${collectionSlug}`,
        })}?${[qs.stringify(query), saved].filter(Boolean).join('&')}`,
      );
    }

    const groupBy =
      typeof query.groupBy === 'string'
        ? query.groupBy
        : (clientProps.queryPreset?.groupBy ?? props.listPreferences?.groupBy);

    if (groupBy) {
      const groupsKey = getGroupsPreferenceKey(collectionSlug, view.slug);
      const columns = clientProps.columnState?.length
        ? clientProps.columnState.map(({ accessor, active }) => ({ accessor, active }))
        : resolveViewColumnPreferences({
            defaultFields: view.defaultFields,
            useAsTitle: collectionConfig.admin.useAsTitle,
          });

      grouped = await renderGroupedTable({
        baseFilter: clientProps.baseFilter,
        canCreate: clientProps.hasCreatePermission,
        clientCollectionConfig: getClientConfig({
          config: payload.config,
          i18n,
          importMap: payload.importMap,
          user: user ?? null,
        }).collections.find(({ slug }) => slug === collectionSlug)!,
        collapsed: toKeys((await readViewPreference(req, groupsKey))?.collapsed),
        collectionConfig,
        columns,
        enableRowSelections: clientProps.enableRowSelections ?? true,
        fieldPermissions: permissions?.collections?.[collectionSlug]?.fields,
        groupBy,
        limit,
        preferenceKey: groupsKey,
        query,
        req,
        sort:
          typeof query.sort === 'string'
            ? query.sort
            : (props.listPreferences?.sort ??
              (typeof collectionConfig.defaultSort === 'string'
                ? collectionConfig.defaultSort
                : undefined)),
        viewType: clientProps.viewType,
      });
    }

    summary = await resolveSummaryProps({
      collectionConfig,
      columns: (clientProps.columnState ?? []).map(({ accessor }) => accessor),
      defaults: view.summary,
      preference: setup.preference,
      preferenceKey: setup.preferenceKey,
      query,
      req,
    });
  }

  const slots = buildFrameSlots({
    activeSlug: view?.slug,
    adminRoute: payload.config.routes.admin,
    collectionConfig,
    hasCreatePermission: clientProps.hasCreatePermission,
    hasDeletePermission: Boolean(clientProps.hasDeletePermission),
    i18n,
    importMap: payload.importMap,
    runtime,
    serverProps: {
      collectionConfig,
      data,
      i18n,
      limit,
      listPreferences: props.listPreferences,
      listSearchableFields,
      locale,
      params,
      payload,
      permissions,
      searchParams,
      server,
      user,
    },
    skipLayoutSlots: true,
    view,
    views,
    viewType: clientProps.viewType,
  });

  const docs = (data as { docs?: Row[] } | undefined)?.docs ?? [];
  const isEmpty = grouped
    ? grouped.totalDocs === 0
    : docs.length === 0 && !clientProps.groupedData?.length;

  const doneIds = await findDoneIds({
    collectionSlug,
    docs:
      grouped?.docs ??
      clientProps.groupedData?.flatMap((group) => group.data.docs as Row[]) ??
      docs,
    req,
    trash: clientProps.viewType === 'trash',
    useAsDone: (collectionConfig.admin.custom?.frogbot as { useAsDone?: string } | undefined)
      ?.useAsDone,
  });

  return (
    <ListFrameClient
      {...slots}
      AfterList={clientProps.AfterList}
      AfterListTable={clientProps.AfterListTable}
      BeforeList={clientProps.BeforeList}
      BeforeListTable={clientProps.BeforeListTable}
      Description={clientProps.Description ?? slots.Description}
      doneIds={doneIds}
      isEmpty={isEmpty}
      listMenuItems={[...(clientProps.listMenuItems ?? []), ...(slots.listMenuItems ?? [])]}
      listProps={{ ...clientProps, Table: grouped?.Table ?? withRowIds(clientProps.Table) }}
      pagedGroups={grouped?.pagedGroups}
      summary={summary}
    />
  );
}

import { getColumns, renderTable } from '@payloadcms/ui/rsc';
import type { FrogbotRequest } from 'frogbot';
import { notFound } from 'next/navigation';
import type {
  AdminViewServerProps,
  SanitizedFieldPermissions,
  SanitizedFieldsPermissions,
} from 'payload';
import { getFromImportMap, transformColumnsToSearchParams } from 'payload/shared';
import type { ComponentType } from 'react';

import { getActiveViewSlug, resolveCollectionViews } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import {
  getViewPreferenceKey,
  resolveViewColumnPreferences,
  type ViewColumnsSource,
} from '../preferences.js';
import { CalendarPreference } from './CalendarPreference.client.js';
import { CalendarViewClient } from './CalendarView.client.js';
import { type CalendarPreferenceValue, resolveCalendarDate, resolveCalendarMode } from './data.js';

function canUpdateField(fields: SanitizedFieldsPermissions | undefined, path: string): boolean {
  let fieldPermission: SanitizedFieldPermissions | undefined;
  let fieldPermissions = fields;
  for (const key of path.split('.')) {
    if (!fieldPermissions || fieldPermissions === true) {
      fieldPermission = fieldPermissions;
      break;
    }
    fieldPermission = fieldPermissions[key];
    fieldPermissions = fieldPermission === true ? true : fieldPermission?.fields;
  }
  return fieldPermission === true || Boolean(fieldPermission?.update);
}

export async function CalendarView(props: AdminViewServerProps) {
  const { clientConfig, collectionConfig, collectionSlug, importMap, initPageResult, payload } =
    props;
  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const calendar = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );
  if (!calendar || calendar.type !== 'calendar') notFound();

  const query = (initPageResult.req.query ?? {}) as {
    columns?: unknown;
    date?: unknown;
    mode?: unknown;
  };
  const queryMode = typeof query.mode === 'string' ? query.mode : undefined;
  const queryDate = typeof query.date === 'string' ? query.date : undefined;
  const queryColumns: ViewColumnsSource =
    typeof query.columns === 'string' ||
    (Array.isArray(query.columns) && query.columns.every((value) => typeof value === 'string'))
      ? (query.columns as string | string[])
      : undefined;
  const preferenceKey = getViewPreferenceKey(collectionSlug, calendar.slug);
  const preference = initPageResult.req.user
    ? await payload.find({
        collection: 'payload-preferences',
        depth: 0,
        limit: 1,
        pagination: false,
        req: initPageResult.req,
        where: {
          and: [
            { key: { equals: preferenceKey } },
            { 'user.relationTo': { equals: initPageResult.req.user.collection } },
            { 'user.value': { equals: initPageResult.req.user.id } },
          ],
        },
      })
    : undefined;
  const preferenceValue = preference?.docs[0]?.value as CalendarPreferenceValue | undefined;
  const mode = resolveCalendarMode({
    configuredModes: calendar.modes,
    preferenceMode: preferenceValue?.mode,
    queryMode,
  });
  const date = resolveCalendarDate({
    preferenceDate: preferenceValue?.date,
    queryDate,
    today: new Date().toISOString(),
  });
  const columnPreferences = resolveViewColumnPreferences({
    defaultFields: calendar.defaultFields,
    preferenceColumns: Array.isArray(preferenceValue?.columns)
      ? preferenceValue.columns
      : undefined,
    queryColumns,
    useAsTitle: collectionConfig.admin.useAsTitle,
  });
  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const clientCollectionConfig = clientConfig.collections.find(
    ({ slug }) => slug === collectionSlug,
  );
  const columns = getColumns({
    clientConfig,
    collectionConfig: clientCollectionConfig,
    collectionSlug,
    columns: columnPreferences,
    i18n: initPageResult.req.i18n,
    permissions: initPageResult.permissions,
  });
  const { columnState } = renderTable({
    clientCollectionConfig,
    collectionConfig,
    columns,
    enableRowSelections: false,
    fieldPermissions: permissions?.fields,
    i18n: initPageResult.req.i18n,
    orderableFieldName: '',
    payload,
    req: initPageResult.req,
    useAsTitle: collectionConfig.admin.useAsTitle,
  });
  const initialQuery = {
    ...initPageResult.req.query,
    columns: transformColumnsToSearchParams(columns),
    date,
    mode,
  };
  const filter =
    typeof calendar.filter === 'function'
      ? await calendar.filter({ req: initPageResult.req as unknown as FrogbotRequest })
      : calendar.filter;
  const canUpdate = Boolean(
    permissions?.update &&
    canUpdateField(permissions.fields, calendar.start) &&
    (!calendar.end || canUpdateField(permissions.fields, calendar.end)),
  );
  const Event = calendar.components?.Event
    ? getFromImportMap<ComponentType<{ row: { end?: string; id: string; start: string } }>>({
        importMap,
        PayloadComponent: calendar.components.Event as never,
        schemaPath: '',
      })
    : undefined;

  return (
    <CollectionViewShell
      {...props}
      columnState={columnState}
      enableSort={false}
      query={initialQuery}
      viewComponents={calendar.components}
      views={views}
      viewSlug={calendar.slug}
    >
      <CalendarPreference
        collectionSlug={collectionSlug}
        columns={queryColumns ? columns : undefined}
        date={Object.prototype.hasOwnProperty.call(query, 'date') ? date : undefined}
        mode={Object.prototype.hasOwnProperty.call(query, 'mode') ? mode : undefined}
        viewSlug={calendar.slug}
      />
      <CalendarViewClient
        Event={Event}
        canCreate={Boolean(permissions?.create)}
        canUpdate={canUpdate}
        collectionSlug={collectionSlug}
        color={calendar.color}
        date={date}
        filter={filter}
        mode={mode}
        modes={calendar.modes}
        snap={calendar.snap}
        start={calendar.start}
        end={calendar.end}
      />
    </CollectionViewShell>
  );
}

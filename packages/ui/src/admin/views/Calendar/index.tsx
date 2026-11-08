import { getColumns, renderTable } from '@payloadcms/ui/rsc';
import { type AdminViewServerProps, getFieldByPath } from 'payload';
import { getFromImportMap, transformColumnsToSearchParams } from 'payload/shared';
import type { ComponentType } from 'react';

import { getActiveViewSlug, resolveCollectionViews, withPageProps } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import { canUpdateField } from '../fieldPermissions.js';
import { resolveViewColumnPreferences, type ViewColumnsSource } from '../preferences.js';
import { resolveViewSetup } from '../viewSetup.js';
import { CalendarPreference } from './CalendarPreference.client.js';
import { CalendarViewClient } from './CalendarView.client.js';
import {
  type CalendarPreferenceValue,
  isDateOnly,
  resolveCalendarDate,
  resolveCalendarMode,
} from './data.js';

export async function CalendarView(input: AdminViewServerProps) {
  const props = await withPageProps(input);
  const { clientConfig, collectionConfig, collectionSlug, importMap, initPageResult, payload } =
    props;

  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const calendar = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );

  if (!calendar || calendar.type !== 'calendar') return props.server.notFound();

  const setup = await resolveViewSetup({
    collectionSlug,
    query: initPageResult.req.query ?? {},
    req: initPageResult.req,
    viewSlug: calendar.slug,
  });

  const urlQuery = (initPageResult.req.query ?? {}) as { date?: unknown; mode?: unknown };
  const queryMode = typeof urlQuery.mode === 'string' ? urlQuery.mode : undefined;
  const queryDate = typeof urlQuery.date === 'string' ? urlQuery.date : undefined;
  const queryColumns =
    typeof setup.query.columns === 'string' || Array.isArray(setup.query.columns)
      ? (setup.query.columns as ViewColumnsSource)
      : undefined;

  const preferenceValue = setup.preference as CalendarPreferenceValue | undefined;
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
    ...setup.query,
    columns: transformColumnsToSearchParams(columns),
    date,
    mode,
  };

  const canUpdate = Boolean(
    permissions?.update &&
    canUpdateField(permissions.fields, calendar.start) &&
    (!calendar.end || canUpdateField(permissions.fields, calendar.end)),
  );

  const Event = calendar.components?.Event
    ? getFromImportMap<ComponentType<{ row: { end?: string; id: string; start: string } }>>({
        importMap,
        PayloadComponent: calendar.components.Event,
        schemaPath: '',
      })
    : undefined;

  return (
    <CollectionViewShell
      {...props}
      columnState={columnState}
      enableSort={false}
      query={initialQuery}
      keepViewWhenEmpty
      preference={setup.preference}
      preferenceKey={setup.preferenceKey}
      view={calendar}
      views={views}
    >
      <CalendarPreference
        collectionSlug={collectionSlug}
        date={queryDate === undefined ? undefined : date}
        mode={queryMode === undefined ? undefined : mode}
        viewSlug={calendar.slug}
      />
      <CalendarViewClient
        Event={Event}
        canCreate={Boolean(permissions?.create)}
        canUpdate={canUpdate}
        collectionSlug={collectionSlug}
        color={calendar.color}
        date={date}
        dateOnly={isDateOnly(
          getFieldByPath({ fields: collectionConfig.flattenedFields, path: calendar.start })?.field,
        )}
        endDateOnly={
          calendar.end
            ? isDateOnly(
                getFieldByPath({ fields: collectionConfig.flattenedFields, path: calendar.end })
                  ?.field,
              )
            : false
        }
        filter={calendar.filter}
        mode={mode}
        modes={calendar.modes}
        snap={calendar.snap}
        start={calendar.start}
        end={calendar.end}
      />
    </CollectionViewShell>
  );
}

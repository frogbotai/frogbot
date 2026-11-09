import { type AdminViewServerProps, getFieldByPath } from 'payload';
import { getFromImportMap } from 'payload/shared';
import type { ComponentType } from 'react';

import { TIMELINE_SCALES } from '../../../timeline/core.js';
import { getOptionColors } from '../../fields/optionColor.js';
import { resolveBoardGroupBy } from '../Board/data.js';
import { CalendarPreference } from '../Calendar/CalendarPreference.client.js';
import {
  type CalendarPreferenceValue,
  isDateOnly,
  resolveCalendarDate,
  resolveCalendarMode,
} from '../Calendar/data.js';
import { getActiveViewSlug, resolveCollectionViews, withPageProps } from '../collectionViews.js';
import { CollectionViewShell } from '../CollectionViewShell.js';
import { canUpdateField } from '../fieldPermissions.js';
import { resolveGroupField, resolveGroups } from '../groups/resolve.js';
import { resolveViewSetup } from '../viewSetup.js';
import { type TimelineRow, TimelineViewClient } from './TimelineView.client.js';

export async function TimelineView(input: AdminViewServerProps) {
  const props = await withPageProps(input);
  const { collectionConfig, collectionSlug, importMap, initPageResult } = props;

  if (!collectionConfig || !collectionSlug) return null;
  const { runtime, views } = await resolveCollectionViews(props);
  const activeSlug = getActiveViewSlug(props) ?? runtime[0]?.slug;
  const timeline = runtime.find(
    ({ slug }) => slug === activeSlug && views.some((item) => item.slug === slug),
  );

  if (!timeline || timeline.type !== 'timeline') return props.server.notFound();

  const { req } = initPageResult;
  const setup = await resolveViewSetup({
    collectionSlug,
    query: req.query ?? {},
    req,
    viewSlug: timeline.slug,
  });

  const urlQuery = (req.query ?? {}) as { date?: unknown; scale?: unknown };
  const queryScale = typeof urlQuery.scale === 'string' ? urlQuery.scale : undefined;
  const queryDate = typeof urlQuery.date === 'string' ? urlQuery.date : undefined;
  const preferenceValue = setup.preference as CalendarPreferenceValue | undefined;
  const scales = timeline.scales?.length ? timeline.scales : TIMELINE_SCALES;

  const scale = resolveCalendarMode({
    configuredModes: scales,
    preferenceMode: preferenceValue?.scale,
    queryMode: queryScale,
  });

  const date = resolveCalendarDate({
    preferenceDate: preferenceValue?.date,
    queryDate,
    today: new Date().toISOString(),
  });

  const query = setup.query as { groupBy?: unknown };
  const groupBy =
    resolveBoardGroupBy({
      configuredGroupBy: timeline.groupBy,
      hasQueryGroupBy: Object.prototype.hasOwnProperty.call(query, 'groupBy'),
      queryGroupBy: typeof query.groupBy === 'string' ? query.groupBy : undefined,
    }).replace(/^-/, '') || undefined;

  const groupField = groupBy ? resolveGroupField(collectionConfig.fields, groupBy) : undefined;
  const groups = groupField
    ? await resolveGroups({ collectionSlug, field: groupField, path: groupBy ?? '', req })
    : undefined;

  const permissions = initPageResult.permissions.collections?.[collectionSlug];
  const canUpdate = Boolean(
    permissions?.update &&
    canUpdateField(permissions.fields, timeline.start) &&
    (!timeline.end || canUpdateField(permissions.fields, timeline.end)),
  );

  const Bar = timeline.components?.Bar
    ? getFromImportMap<ComponentType<{ row: TimelineRow }>>({
        importMap,
        PayloadComponent: timeline.components.Bar,
        schemaPath: '',
      })
    : undefined;

  const fieldAt = (path: string | undefined) =>
    path ? getFieldByPath({ fields: collectionConfig.flattenedFields, path })?.field : undefined;

  const colorField = fieldAt(timeline.color);

  return (
    <CollectionViewShell
      {...props}
      enableSort={false}
      keepViewWhenEmpty
      preference={setup.preference}
      preferenceKey={setup.preferenceKey}
      query={{ ...setup.query, date, scale }}
      view={timeline}
      views={views}
    >
      <CalendarPreference
        collectionSlug={collectionSlug}
        date={queryDate === undefined ? undefined : date}
        scale={queryScale === undefined ? undefined : scale}
        viewSlug={timeline.slug}
      />
      <TimelineViewClient
        Bar={Bar}
        canUpdate={canUpdate}
        collectionSlug={collectionSlug}
        color={timeline.color}
        date={date}
        dateOnly={{
          end: isDateOnly(fieldAt(timeline.end)),
          start: isDateOnly(fieldAt(timeline.start)),
        }}
        end={timeline.end}
        filter={timeline.filter}
        groupBy={groupField ? groupBy : undefined}
        groups={groups}
        noValueLabel={req.i18n.t('general:noValue')}
        optionColors={colorField ? getOptionColors(colorField) : undefined}
        scale={scale}
        scales={scales}
        start={timeline.start}
      />
    </CollectionViewShell>
  );
}

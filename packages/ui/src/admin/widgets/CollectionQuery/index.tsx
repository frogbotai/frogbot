import { getTranslation } from '@payloadcms/translations';
import { CollectionQueryWidget as PayloadCollectionQueryWidget } from '@payloadcms/ui/rsc';
import type { CollectionSlug, Option, Where, WidgetServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';
import * as qs from 'qs-esm';

import { Card, CardContent, CardHeader, CardTitle } from '../../../components/card.js';
import { EmptyState } from '../../../components/empty-state.js';
import { List, ListItem } from '../../../components/list.js';
import { OptionPill } from '../../../components/option-pill.js';
import { Value } from '../../../components/value.js';
import { getFieldKind } from '../../fields/kind.js';
import { getOptionColors, pickOptionColor } from '../../fields/optionColor.js';
import { getRuntimeViews } from '../../views/collectionViews.js';
import { formatRowDate, pickRowFacts, type RowFact } from './rows.js';

type WidgetData = {
  limit?: number;
  relatedCollection?: CollectionSlug;
  sortDirection?: 'asc' | 'desc';
  sortField?: string;
  title?: string;
  where?: Where;
};

type Props = WidgetServerProps<{ data?: WidgetData }>;

function clampLimit(limit: unknown): number {
  return typeof limit === 'number' && !Number.isNaN(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 25)
    : 5;
}

/**
 * The dashboard's record list, shaped like Linear's and Asana's home lists: hairline rows with the
 * title, the record's stage as a pill, its key number, and the date people plan around, which
 * turns red once it passes. A bad collection, sort field or filter falls back to Payload's widget,
 * which explains the mistake.
 */
export async function CollectionQueryWidget(props: Props) {
  const { req, widgetData } = props;
  const { i18n, payload, user } = req;
  const { relatedCollection, sortDirection = 'desc', sortField, title, where } = widgetData ?? {};
  const collection = relatedCollection ? payload.collections[relatedCollection]?.config : undefined;
  const fields = collection?.flattenedFields ?? [];
  const sortable =
    !sortField || STAMP_FIELDS.has(sortField) || fields.some(({ name }) => name === sortField);

  if (!relatedCollection || !collection || !sortable) {
    return <PayloadCollectionQueryWidget {...props} />;
  }

  const sort = sortField ? `${sortDirection === 'desc' ? '-' : ''}${sortField}` : undefined;
  let docs: Record<string, unknown>[];

  try {
    ({ docs } = await payload.find({
      collection: relatedCollection,
      depth: 0,
      limit: clampLimit(widgetData?.limit),
      overrideAccess: false,
      sort,
      user,
      where,
    }));
  } catch {
    return <PayloadCollectionQueryWidget {...props} />;
  }

  const titleField = collection.admin.useAsTitle || 'id';
  const plural = getTranslation(collection.labels.plural, i18n);
  const facts = pickRowFacts({
    fields,
    sortField,
    titleField,
    views: getRuntimeViews({ collectionConfig: collection }),
  });

  const adminRoute = payload.config.routes.admin;
  const listHref = formatAdminURL({
    adminRoute,
    path: `/collections/${relatedCollection}${qs.stringify({ sort, where }, { addQueryPrefix: true })}`,
  });

  return (
    <Card className="fb-query-widget">
      <CardHeader className="fb-query-widget__header">
        <CardTitle>{title || plural}</CardTitle>
        <a className="fb-query-widget__all" href={listHref}>
          {i18n.t('general:showAllLabel', { label: plural })}
        </a>
      </CardHeader>
      <CardContent className="fb-query-widget__content">
        {docs.length ? (
          <List>
            {docs.map((doc) => {
              const date = formatRowDate({
                field: sortField ?? 'updatedAt',
                locale: i18n.language,
                value: sortField ? doc[sortField] : (doc.updatedAt ?? doc.createdAt),
              });

              return (
                <ListItem
                  href={formatAdminURL({
                    adminRoute,
                    path: `/collections/${relatedCollection}/${String(doc.id)}`,
                  })}
                  key={String(doc.id)}
                  meta={
                    <>
                      {facts.map((fact) => (
                        <RowFactValue
                          fact={fact}
                          i18n={i18n}
                          key={fact.field.name}
                          value={doc[fact.field.name]}
                        />
                      ))}
                      {date ? (
                        <time
                          className={`fb-query-widget__date${date.overdue ? ' fb-query-widget__date--overdue' : ''}`}
                          dateTime={date.dateTime}
                        >
                          {date.label}
                        </time>
                      ) : null}
                    </>
                  }
                  title={
                    typeof doc[titleField] === 'string' && doc[titleField]
                      ? doc[titleField]
                      : String(doc.id)
                  }
                />
              );
            })}
          </List>
        ) : (
          <EmptyState size="compact" title={i18n.t('general:nothingFound')} />
        )}
      </CardContent>
    </Card>
  );
}

const STAMP_FIELDS = new Set(['createdAt', 'updatedAt']);

function RowFactValue({
  fact,
  i18n,
  value,
}: {
  fact: RowFact;
  i18n: Props['req']['i18n'];
  value: unknown;
}) {
  if (value === null || value === undefined || value === '') return null;

  if (fact.kind === 'select') {
    const options: Option[] = 'options' in fact.field ? fact.field.options : [];
    const option = options.find(
      (candidate) => (typeof candidate === 'string' ? candidate : candidate.value) === value,
    );

    const label =
      option === undefined
        ? String(value)
        : typeof option === 'string'
          ? option
          : getTranslation(option.label, i18n) || option.value;

    return (
      <OptionPill color={pickOptionColor(getOptionColors(fact.field), value) ?? 'gray'}>
        {label}
      </OptionPill>
    );
  }

  if (typeof value !== 'number') return null;

  const kind = getFieldKind(fact.field as Parameters<typeof getFieldKind>[0]);

  return (
    <Value
      className="fb-query-widget__number"
      currency={
        kind?.type === 'money' && typeof kind.currency === 'string' ? kind.currency : undefined
      }
      format={
        kind?.type === 'money' ? 'currency' : kind?.type === 'percent' ? 'percent' : undefined
      }
      locale={i18n.language}
      value={value}
    />
  );
}

import './ActivityField.css';

import { PanelSection } from '@frogbotai/ui/admin';
import type { getTranslation, I18nClient } from '@payloadcms/translations';

import { defaultAuditSlug } from '../collection.js';
import { auditLogCustomKey } from '../fields/activity.js';
import type { AuditOperation } from '../types.js';
import {
  type ConfigField,
  type FieldInfo,
  fieldInfo,
  formatValue,
  relatedIds,
  titleOf,
  type Titles,
  translate,
} from './values.js';

type Doc = Record<string, unknown> & { id: number | string };

type FindArgs = {
  collection: string;
  depth: number;
  overrideAccess: false;
  req: unknown;
};

type ActivityPayload = {
  collections: Record<
    string,
    { config: { admin?: { useAsTitle?: string }; fields: ConfigField[] } } | undefined
  >;
  config: { custom?: Record<string, unknown> };
  find: (
    args: FindArgs & { limit: number; sort: string; where: Record<string, unknown> },
  ) => Promise<{ docs: Doc[] }>;
  findByID: (args: FindArgs & { disableErrors: true; id: number | string }) => Promise<Doc | null>;
};

/** The server props Payload gives a field component that `ActivityField` reads. */
export type ActivityFieldProps = {
  collectionSlug?: string;
  field?: { label?: Label };
  i18n?: Pick<I18nClient, 'fallbackLanguage' | 'language' | 't'>;
  id?: number | string;
  req?: { payload: ActivityPayload; user?: unknown };
};

type Entry = {
  changes?: Record<string, unknown>;
  id: number | string;
  operation: AuditOperation;
  timestamp: string;
  user?: Doc | number | string | null;
};

type Label = Parameters<typeof getTranslation>[0];

const LIMIT = 20;

function auditSlugOf(payload: ActivityPayload): string {
  const options = payload.config.custom?.[auditLogCustomKey] as { auditSlug?: string } | undefined;

  return options?.auditSlug ?? defaultAuditSlug;
}

function titleKeyOf(payload: ActivityPayload, slug: unknown): string | undefined {
  return typeof slug === 'string' ? payload.collections[slug]?.config.admin?.useAsTitle : undefined;
}

function userName(user: Entry['user'], titleKey: string | undefined): string {
  return (user && typeof user === 'object' && titleOf(user, titleKey)) || 'Someone';
}

async function relatedTitles(
  payload: ActivityPayload,
  req: unknown,
  entries: Entry[],
  info: Map<string, FieldInfo>,
): Promise<Titles> {
  const titles: Titles = new Map();
  const lookups = [
    ...relatedIds(
      entries.map((entry) => entry.changes),
      info,
    ),
  ].map(async ([collection, ids]) => {
    if (!payload.collections[collection]) return;

    const { docs } = await payload
      .find({
        collection,
        depth: 0,
        limit: ids.size,
        overrideAccess: false,
        req,
        sort: 'id',
        where: { id: { in: [...ids] } },
      })
      .catch(() => ({ docs: [] as Doc[] }));

    const titleKey = titleKeyOf(payload, collection);

    for (const doc of docs) {
      const title = titleOf(doc, titleKey);
      if (title) titles.set(`${collection}:${doc.id}`, title);
    }
  });

  await Promise.all(lookups);

  return titles;
}

type Change = { from: string; label: string; to: string };

type Described = { changes: Change[]; summary: string };

function describe(
  entry: Entry,
  info: Map<string, FieldInfo>,
  format: (field: FieldInfo['field'], value: unknown) => string | undefined,
): Described {
  if (entry.operation === 'create') return { changes: [], summary: 'created this' };
  if (entry.operation === 'delete') return { changes: [], summary: 'deleted this' };

  const keys = Object.keys(entry.changes ?? {}).filter((key) => info.has(key));
  if (!keys.length) return { changes: [], summary: 'edited this' };

  const changes = keys.flatMap((key) => {
    const { field, label } = info.get(key) as FieldInfo;
    const diff = (entry.changes?.[key] ?? {}) as { new?: unknown; old?: unknown };
    const from = format(field, diff.old);
    const to = format(field, diff.new);

    return from === undefined || to === undefined ? [] : [{ from, label, to }];
  });

  return {
    changes,
    summary: `changed ${keys.map((key) => info.get(key)?.label).join(', ')}`,
  };
}

/**
 * Lists the open record's audit entries, newest first. Both the record and its entries are read
 * with the signed-in user's access, and a change names only fields the user can read, so a
 * record the user can't read shows nothing. A change to an option, related record, text, number,
 * date or checkbox also shows its old and new value, with options by label and related records
 * by title; a related record the user can't read shows its ID. Entries older than the record are
 * skipped, since a database can reuse a deleted record's id. Renders nothing on a create form.
 */
export async function ActivityField({ collectionSlug, field, i18n, id, req }: ActivityFieldProps) {
  if (!req?.user || !collectionSlug || id === undefined || id === null || id === '') return null;

  const { payload } = req;
  const collection = payload.collections[collectionSlug];
  if (!collection) return null;

  const record = await payload
    .findByID({
      id,
      collection: collectionSlug,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      req,
    })
    .catch(() => null);

  if (!record) return null;

  const auditSlug = auditSlugOf(payload);
  const { docs } = await payload
    .find({
      collection: auditSlug,
      depth: 1,
      limit: LIMIT,
      overrideAccess: false,
      req,
      sort: '-timestamp',
      where: {
        and: [
          { collection: { equals: collectionSlug } },
          { documentId: { equals: String(id) } },
          ...(typeof record.createdAt === 'string'
            ? [{ timestamp: { greater_than_equal: record.createdAt } }]
            : []),
        ],
      },
    })
    .catch(() => ({ docs: [] as Doc[] }));

  const entries = docs as Entry[];
  const userField = payload.collections[auditSlug]?.config.fields.find(
    (auditField) => auditField.name === 'user',
  );

  const userTitleKey = titleKeyOf(payload, userField?.relationTo);
  const info = fieldInfo(collection.config.fields, i18n);
  const readable = new Map([...info].filter(([key]) => key in record));
  const titles = await relatedTitles(payload, req, entries, readable);
  const heading = translate(field?.label, i18n) ?? 'Activity';
  const formatter = new Intl.DateTimeFormat(i18n?.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const dates = new Intl.DateTimeFormat(i18n?.language, { dateStyle: 'medium' });
  const format = (config: FieldInfo['field'], value: unknown) =>
    formatValue(config, value, titles, i18n, dates);

  return (
    <PanelSection className="fb-activity" heading={heading}>
      {entries.length ? (
        <ol className="fb-activity__list">
          {entries.map((entry) => {
            const { changes, summary } = describe(entry, readable, format);

            return (
              <li className="fb-activity__entry" key={entry.id}>
                <span className="fb-activity__dot" />
                <p className="fb-activity__text">
                  <strong>{userName(entry.user, userTitleKey)}</strong> {summary}
                </p>
                {changes.length ? (
                  <ul className="fb-activity__changes">
                    {changes.map((change) => (
                      <li className="fb-activity__change" key={change.label}>
                        <span className="fb-activity__field">{change.label}</span>{' '}
                        <span className="fb-activity__from">{change.from}</span>
                        {' → '}
                        <span className="fb-activity__to">{change.to}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <time className="fb-activity__time" dateTime={entry.timestamp}>
                  {formatter.format(new Date(entry.timestamp))}
                </time>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="fb-activity__empty">No activity yet.</p>
      )}
    </PanelSection>
  );
}

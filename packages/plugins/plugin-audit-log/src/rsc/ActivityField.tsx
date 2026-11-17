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
  findField,
  formatDate,
  formatValue,
  relatedIds,
  showsTime,
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

type DatesFor = (field: ConfigField) => Intl.DateTimeFormat;

function titleFormat(
  payload: ActivityPayload,
  slug: string,
  titleKey: string | undefined,
  datesFor: DatesFor,
) {
  const titleField = findField(payload.collections[slug]?.config.fields ?? [], titleKey);

  return titleField?.type === 'date'
    ? (value: string) => formatDate(value, datesFor(titleField))
    : undefined;
}

function userName(user: Entry['user'], titleKey: string | undefined): string {
  if (!user || typeof user !== 'object') return 'Someone';

  const email = typeof user.email === 'string' && user.email ? user.email : undefined;

  return titleOf(user, titleKey) ?? email ?? `#${user.id}`;
}

async function relatedTitles(
  payload: ActivityPayload,
  req: unknown,
  entries: Entry[],
  info: Map<string, FieldInfo>,
  datesFor: DatesFor,
): Promise<Titles> {
  const titles: Titles = new Map();
  const lookups = [
    ...relatedIds(
      entries.filter((entry) => entry.operation === 'update').map((entry) => entry.changes),
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
    const format = titleFormat(payload, collection, titleKey, datesFor);

    for (const doc of docs) {
      const title = titleOf(doc, titleKey, format);
      if (title) titles.set(`${collection}:${doc.id}`, title);
    }
  });

  await Promise.all(lookups);

  return titles;
}

type Line = { key: string; label?: string; value?: string; verb: string };

type Format = (field: FieldInfo['field'], value: unknown, withTime: boolean) => string | undefined;

const GROUP_GAP = 10 * 60 * 1000;

function changeLine(key: string, info: FieldInfo, diff: unknown, format: Format): Line[] {
  const { field, label } = info;
  const { new: next, old } = (diff ?? {}) as { new?: unknown; old?: unknown };
  let from = format(field, old, showsTime(field));
  let to = format(field, next, showsTime(field));

  if (from === to && field.type === 'date') {
    from = format(field, old, true);
    to = format(field, next, true);
  }

  if (to === undefined || from === undefined) return [{ key, label, verb: 'changed' }];
  if (from === to) return [];
  if (to === 'None') return [{ key, label, verb: 'cleared' }];

  return [{ key, label, value: to, verb: 'changed' }];
}

function describe(entry: Entry, info: Map<string, FieldInfo>, format: Format): Line[] {
  if (entry.operation === 'create') return [{ key: 'create', verb: 'created this' }];
  if (entry.operation === 'delete') return [{ key: 'delete', verb: 'deleted this' }];

  const keys = Object.keys(entry.changes ?? {}).filter((key) => info.has(key));
  if (!keys.length) return [{ key: 'edit', verb: 'edited this' }];

  return keys.flatMap((key) =>
    changeLine(key, info.get(key) as FieldInfo, entry.changes?.[key], format),
  );
}

function actorOf(entry: Entry): unknown {
  return entry.user && typeof entry.user === 'object' ? entry.user.id : entry.user;
}

function groupRuns(entries: Entry[]): Entry[][] {
  const runs: Entry[][] = [];

  for (const entry of entries) {
    const run = runs.at(-1);
    const last = run?.at(-1);

    if (
      run &&
      last &&
      actorOf(last) === actorOf(entry) &&
      Date.parse(entry.timestamp) - Date.parse(last.timestamp) <= GROUP_GAP
    ) {
      run.push(entry);
    } else {
      runs.push([entry]);
    }
  }

  return runs;
}

/**
 * Lists the open record's latest audit entries, oldest first, one line per changed field, with
 * runs by the same person a few minutes apart grouped together. Both the record and its entries
 * are read with the signed-in user's access, and a change names only fields the user can read,
 * so a record the user can't read shows nothing. A change to an option, related record, text,
 * number, date or checkbox also shows its new value, with options by label and related records
 * by their `useAsTitle`; a related record whose title the user can't read shows its ID. Entries older than the record are
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

  const entries = (docs as Entry[]).reverse();
  const userField = payload.collections[auditSlug]?.config.fields.find(
    (auditField) => auditField.name === 'user',
  );

  const userTitleKey = titleKeyOf(payload, userField?.relationTo);
  const info = fieldInfo(collection.config.fields, i18n);
  const readable = new Map([...info].filter(([key]) => key in record));
  const heading = translate(field?.label, i18n) ?? 'Activity';
  const language = i18n?.language;
  const full = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const day = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
  const thisYear = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' });
  const year = new Date().getFullYear();
  const short = (date: Date) => (date.getFullYear() === year ? thisYear : day).format(date);
  const titles = await relatedTitles(payload, req, entries, readable, (config) =>
    showsTime(config) ? full : day,
  );

  const format: Format = (config, value, withTime) =>
    formatValue(config, value, titles, i18n, withTime ? full : day);

  const runs = groupRuns(entries)
    .map((run) =>
      run.flatMap((entry) => describe(entry, readable, format).map((line) => ({ ...line, entry }))),
    )
    .filter((lines) => lines.length);

  return (
    <PanelSection className="fb-activity" heading={heading}>
      {runs.length ? (
        <ol className="fb-activity__list">
          {runs.map((lines) => (
            <li className="fb-activity__run" key={`${lines[0].entry.id}`}>
              {lines.map(({ entry, key, label, value, verb }) => {
                const date = new Date(entry.timestamp);

                return (
                  <p className="fb-activity__line" key={`${entry.id}:${key}`}>
                    <strong>{userName(entry.user, userTitleKey)}</strong> {verb}
                    {label ? (
                      <>
                        {' '}
                        <strong>{label}</strong>
                      </>
                    ) : null}
                    {value ? (
                      <>
                        {' to '}
                        <strong>{value}</strong>
                      </>
                    ) : null}
                    {' · '}
                    <time dateTime={entry.timestamp} title={full.format(date)}>
                      {short(date)}
                    </time>
                  </p>
                );
              })}
            </li>
          ))}
        </ol>
      ) : (
        <p className="fb-activity__empty">No activity yet.</p>
      )}
    </PanelSection>
  );
}

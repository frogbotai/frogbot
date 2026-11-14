import './ActivityField.css';

import { PanelSection } from '@frogbotai/ui/admin';
import { getTranslation, type I18nClient } from '@payloadcms/translations';

import { defaultAuditSlug } from '../collection.js';
import { auditLogCustomKey } from '../fields/activity.js';
import type { AuditOperation } from '../types.js';

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
    | { config: { admin?: { useAsTitle?: string }; fields: Array<Record<string, unknown>> } }
    | undefined
  >;
  config: { custom?: Record<string, unknown> };
  find: (
    args: FindArgs & { limit: number; sort: string; where: Record<string, unknown> },
  ) => Promise<{ docs: Entry[] }>;
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

const LIMIT = 20;

function auditSlugOf(payload: ActivityPayload): string {
  const options = payload.config.custom?.[auditLogCustomKey] as { auditSlug?: string } | undefined;

  return options?.auditSlug ?? defaultAuditSlug;
}

function startCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

type ConfigField = Record<string, unknown>;

type Label = Parameters<typeof getTranslation>[0];

type Translator = ActivityFieldProps['i18n'];

function translate(label: unknown, i18n: Translator): string | undefined {
  if (typeof label === 'string') return label;
  if (!i18n || !label || (typeof label !== 'object' && typeof label !== 'function')) {
    return undefined;
  }

  const text: unknown = getTranslation(label as Label, i18n as I18nClient);

  return typeof text === 'string' && text ? text : undefined;
}

function childFields(field: ConfigField): ConfigField[] {
  if (Array.isArray(field.tabs)) {
    return (field.tabs as ConfigField[]).flatMap((tab) =>
      typeof tab.name === 'string' ? [tab] : childFields(tab),
    );
  }

  return Array.isArray(field.fields) ? (field.fields as ConfigField[]) : [];
}

function fieldLabels(
  fields: ConfigField[],
  i18n: Translator,
  labels = new Map<string, string>(),
): Map<string, string> {
  for (const field of fields) {
    if (typeof field.name === 'string') {
      labels.set(field.name, translate(field.label, i18n) ?? startCase(field.name));
    } else {
      fieldLabels(childFields(field), i18n, labels);
    }
  }

  return labels;
}

function userTitleKey(payload: ActivityPayload, auditSlug: string): string | undefined {
  const userField = payload.collections[auditSlug]?.config.fields.find(
    (field) => field.name === 'user',
  );

  const relationTo = userField?.relationTo;

  return typeof relationTo === 'string'
    ? payload.collections[relationTo]?.config.admin?.useAsTitle
    : undefined;
}

function userName(user: Entry['user'], titleKey: string | undefined): string {
  if (!user || typeof user !== 'object') return 'Someone';

  for (const key of [titleKey, 'name', 'email']) {
    const value = key && key !== 'id' ? user[key] : undefined;
    if (typeof value === 'string' && value) return value;
  }

  return 'Someone';
}

function describe(entry: Entry, labels: Map<string, string>, readable: Doc): string {
  if (entry.operation === 'create') return 'created this';
  if (entry.operation === 'delete') return 'deleted this';

  const changed = Object.keys(entry.changes ?? {})
    .filter((key) => key in readable && labels.has(key))
    .map((key) => labels.get(key));

  return changed.length ? `changed ${changed.join(', ')}` : 'edited this';
}

/**
 * Lists the open record's audit entries, newest first. Both the record and its entries are read
 * with the signed-in user's access, and a change names only fields the user can read, so a
 * record the user can't read shows nothing. Entries older than the record are skipped, since a
 * database can reuse a deleted record's id. Renders nothing on a create form.
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
  const { docs: entries } = await payload
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
    .catch(() => ({ docs: [] as Entry[] }));

  const titleKey = userTitleKey(payload, auditSlug);
  const labels = fieldLabels(collection.config.fields, i18n);
  const heading = translate(field?.label, i18n) ?? 'Activity';
  const formatter = new Intl.DateTimeFormat(i18n?.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <PanelSection className="fb-activity" heading={heading}>
      {entries.length ? (
        <ol className="fb-activity__list">
          {entries.map((entry) => (
            <li className="fb-activity__entry" key={entry.id}>
              <span className="fb-activity__dot" />
              <p className="fb-activity__text">
                <strong>{userName(entry.user, titleKey)}</strong> {describe(entry, labels, record)}
              </p>
              <time className="fb-activity__time" dateTime={entry.timestamp}>
                {formatter.format(new Date(entry.timestamp))}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="fb-activity__empty">No activity yet.</p>
      )}
    </PanelSection>
  );
}

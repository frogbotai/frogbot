import { type Access, type CollectionConfig, type Field, fieldAffectsData } from 'frogbot';

import type { AuditCollectionOverrides } from './types.js';

type CollectionOptions = {
  ipAddress: boolean;
  overrides: AuditCollectionOverrides;
  userSlug: string;
};

export const defaultAuditSlug = 'audit-logs';

const loggedIn: Access = ({ req }) => Boolean(req.user);
const denied: Access = () => false;

function defaultFields(options: CollectionOptions): Field[] {
  return [
    { name: 'collection', type: 'text', required: true, index: true },
    {
      name: 'operation',
      type: 'select',
      required: true,
      options: ['create', 'update', 'delete'],
    },
    { name: 'documentId', type: 'text', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: options.userSlug, index: true },
    { name: 'apiKeyId', type: 'text', index: true },
    { name: 'changes', type: 'json', required: true },
    { name: 'snapshot', type: 'json' },
    { name: 'timestamp', type: 'date', required: true, index: true },
    ...(options.ipAddress
      ? ([
          { name: 'ip', type: 'text' },
          { name: 'userAgent', type: 'text' },
        ] satisfies Field[])
      : []),
  ];
}

function topLevelNames(fields: readonly Field[]): string[] {
  return fields.flatMap((field) => {
    if (field.type === 'tabs') {
      return field.tabs.flatMap((tab) =>
        'name' in tab && tab.name ? [tab.name] : topLevelNames(tab.fields),
      );
    }

    if (fieldAffectsData(field)) return [field.name];

    return 'fields' in field ? topLevelNames(field.fields) : [];
  });
}

function assertBuiltIns(fields: readonly Field[], builtIns: readonly Field[]) {
  const names = topLevelNames(fields);
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`[plugin-audit-log] overrides.fields names '${name}' twice.`);
    }

    seen.add(name);
  }

  for (const name of topLevelNames(builtIns)) {
    if (!seen.has(name)) {
      throw new Error(`[plugin-audit-log] overrides.fields must keep '${name}'.`);
    }
  }
}

export function createAuditLogCollection(options: CollectionOptions): CollectionConfig {
  const { fields: overrideFields, ...overrides } = options.overrides;
  const builtIns = defaultFields(options);
  const fields = overrideFields ? overrideFields({ defaultFields: builtIns }) : builtIns;

  if (overrideFields) assertBuiltIns(fields, defaultFields(options));

  return {
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
    ...overrides,
    slug: overrides.slug ?? defaultAuditSlug,
    admin: {
      icon: 'clock',
      views: [
        {
          type: 'list',
          defaultFields: ['timestamp', 'collection', 'operation', 'documentId', 'user'],
        },
      ],
      ...overrides.admin,
    },
    access: {
      read: loggedIn,
      create: denied,
      update: denied,
      delete: denied,
      ...overrides.access,
    },
    fields,
  };
}

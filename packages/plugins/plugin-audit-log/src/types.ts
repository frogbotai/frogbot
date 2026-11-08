import type { CollectionConfig, Field, FrogBotRequest } from 'frogbot';

import type { AuditChanges } from './diff.js';
import type { HiddenTree } from './hidden.js';

export type AuditOperation = 'create' | 'update' | 'delete';

export type AuditSnapshot = 'never' | 'delete' | 'always';

export type AuditCollectionSelection =
  | string[]
  | {
      include?: string[];
      exclude?: string[];
    };

/** The values saved to the audit collection: the built-in fields plus any added by `entry`. */
export type AuditEntry = {
  collection: string;
  operation: AuditOperation;
  documentId: string;
  user?: number | string;
  apiKeyId?: string;
  changes: AuditChanges;
  snapshot?: Record<string, unknown>;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
};

/** What `entry` receives. `doc` and `previousDoc` have hidden fields removed. */
export type AuditEntryArgs = {
  entry: AuditEntry;
  collection: string;
  operation: AuditOperation;
  doc: Record<string, unknown>;
  previousDoc: Record<string, unknown> | undefined;
  req: FrogBotRequest;
};

/** Returns the entry to save, or `false` to save nothing. */
export type AuditEntryFn = (
  args: AuditEntryArgs,
) => AuditEntry | false | Promise<AuditEntry | false>;

/** Overrides for the audit collection, in Payload's collection-override shape. */
export type AuditCollectionOverrides = Partial<Omit<CollectionConfig, 'fields'>> & {
  fields?: (args: { defaultFields: Field[] }) => Field[];
};

export type AuditLogPluginOptions = {
  collections?: AuditCollectionSelection;
  operations?: AuditOperation[];
  overrides?: AuditCollectionOverrides;
  entry?: AuditEntryFn;
  ipAddress?: boolean;
  trustProxy?: boolean;
  retention?: false | { days: number; cron?: string };
  snapshot?: AuditSnapshot;
};

export type AuditHookOptions = {
  auditSlug: string;
  collectionSlug: string;
  entry: AuditEntryFn | undefined;
  hidden: HiddenTree;
  ipAddress: boolean;
  operations: ReadonlySet<AuditOperation>;
  snapshot: AuditSnapshot;
  trustProxy: boolean;
};

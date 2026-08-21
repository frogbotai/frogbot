import type { Access } from 'frogbot';

export type AuditOperation = 'create' | 'update' | 'delete';
export type AuditSnapshot = 'never' | 'delete' | 'always';

export type AuditCollectionSelection =
  | string[]
  | {
      include?: string[];
      exclude?: string[];
    };

export type AuditLogPluginOptions = {
  collections?: AuditCollectionSelection;
  operations?: AuditOperation[];
  collectionSlug?: string;
  access?: { read?: Access };
  ipAddress?: boolean;
  trustProxy?: boolean;
  retention?: false | { days: number; cron?: string };
  snapshot?: AuditSnapshot;
};

export type AuditHookOptions = {
  auditSlug: string;
  collectionSlug: string;
  ipAddress: boolean;
  operations: ReadonlySet<AuditOperation>;
  snapshot: AuditSnapshot;
  trustProxy: boolean;
};

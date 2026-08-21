import type { AfterChangeHook, AfterDeleteHook } from 'frogbot';

import { computeChanges } from './diff.js';
import type { AuditHookOptions, AuditOperation } from './types.js';

type Document = Record<string, unknown> & { id: number | string };

function requestMetadata(headers: Headers, trustProxy: boolean) {
  const forwarded = trustProxy ? headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
  return {
    ip: forwarded || (trustProxy ? headers.get('x-real-ip') : undefined) || undefined,
    userAgent: headers.get('user-agent') || undefined,
  };
}

function writeAudit(
  options: AuditHookOptions,
  operation: AuditOperation,
  doc: Document,
  previousDoc: Document | undefined,
  req: Parameters<AfterChangeHook<Document>>[0]['req'],
) {
  const user = req.user as
    (typeof req.user & { _strategy?: string; apiKeyId?: number | string }) | null;
  const snapshot =
    options.snapshot === 'always' || (options.snapshot === 'delete' && operation === 'delete')
      ? doc
      : undefined;
  void req.frogbot
    .create({
      collection: options.auditSlug as never,
      data: {
        collection: options.collectionSlug,
        operation,
        documentId: String(doc.id),
        user: user?.id,
        apiKeyId:
          user?._strategy === 'api-key' && user.apiKeyId !== undefined
            ? String(user.apiKeyId)
            : undefined,
        changes: operation === 'delete' ? {} : computeChanges(previousDoc, doc),
        snapshot,
        timestamp: new Date().toISOString(),
        ...(options.ipAddress ? requestMetadata(req.headers, options.trustProxy) : {}),
      },
      overrideAccess: true,
      req,
    })
    .catch((error: unknown) =>
      req.frogbot.logger.error('[plugin-audit-log] Failed to write audit log', error),
    );
}

export function createAfterChangeHook(options: AuditHookOptions): AfterChangeHook<Document> {
  return ({ doc, operation, previousDoc, req }) => {
    if (!options.operations.has(operation)) return doc;
    writeAudit(options, operation, doc, operation === 'create' ? undefined : previousDoc, req);
    return doc;
  };
}

export function createAfterDeleteHook(options: AuditHookOptions): AfterDeleteHook<Document> {
  return ({ doc, req }) => {
    writeAudit(options, 'delete', doc, undefined, req);
    return doc;
  };
}

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, FrogBotRequest } from 'frogbot';

import { computeChanges } from './diff.js';
import { type HiddenTree, hiddenTree, stripHidden } from './hidden.js';
import type { AuditEntry, AuditHookOptions, AuditOperation } from './types.js';

type Document = Record<string, unknown> & { id: number | string };

const trees = new WeakMap<readonly unknown[], HiddenTree>();

function hiddenFor(options: AuditHookOptions, collection: unknown): HiddenTree {
  const fields =
    typeof collection === 'object' &&
    collection !== null &&
    'fields' in collection &&
    Array.isArray(collection.fields)
      ? collection.fields
      : options.fields;

  let tree = trees.get(fields);

  if (!tree) {
    tree = hiddenTree(fields, options.blocks);
    trees.set(fields, tree);
  }

  return tree;
}

function requestMetadata(headers: Headers, trustProxy: boolean) {
  const forwarded = trustProxy ? headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;

  return {
    ip: forwarded || (trustProxy ? headers.get('x-real-ip') : undefined) || undefined,
    userAgent: headers.get('user-agent') || undefined,
  };
}

function apiKeyId(user: FrogBotRequest['user']): string | undefined {
  return user &&
    '_strategy' in user &&
    user._strategy === 'api-key' &&
    'apiKeyId' in user &&
    user.apiKeyId !== undefined
    ? String(user.apiKeyId)
    : undefined;
}

async function writeAudit(
  options: AuditHookOptions,
  operation: AuditOperation,
  rawDoc: Document,
  rawPreviousDoc: Document | undefined,
  req: FrogBotRequest,
  collection: unknown,
): Promise<void> {
  try {
    const hidden = hiddenFor(options, collection);
    const doc = stripHidden(rawDoc, hidden);
    const previousDoc = rawPreviousDoc && stripHidden(rawPreviousDoc, hidden);
    const snapshot =
      options.snapshot === 'always' || (options.snapshot === 'delete' && operation === 'delete')
        ? doc
        : undefined;

    const defaults: AuditEntry = {
      collection: options.collectionSlug,
      operation,
      documentId: String(doc.id),
      user: req.user?.id,
      apiKeyId: apiKeyId(req.user),
      changes: operation === 'delete' ? {} : computeChanges(previousDoc, doc),
      snapshot,
      timestamp: new Date().toISOString(),
      ...(options.ipAddress ? requestMetadata(req.headers, options.trustProxy) : {}),
    };

    const entry = options.entry
      ? await options.entry({
          entry: defaults,
          collection: options.collectionSlug,
          operation,
          doc,
          previousDoc,
          req,
        })
      : defaults;

    if (entry === false) return;

    await req.frogbot.create({
      collection: options.auditSlug,
      data: entry,
      overrideAccess: true,
      req,
    });
  } catch (error: unknown) {
    req.frogbot.logger.error('[plugin-audit-log] Failed to write audit log', error);
  }
}

export function createAfterChangeHook(
  options: AuditHookOptions,
): CollectionAfterChangeHook<Document> {
  return async ({ collection, doc, operation, previousDoc, req }) => {
    if (!options.operations.has(operation)) return doc;

    await writeAudit(
      options,
      operation,
      doc,
      operation === 'create' ? undefined : previousDoc,
      req,
      collection,
    );

    return doc;
  };
}

export function createAfterDeleteHook(
  options: AuditHookOptions,
): CollectionAfterDeleteHook<Document> {
  return async ({ collection, doc, req }) => {
    await writeAudit(options, 'delete', doc, undefined, req, collection);

    return doc;
  };
}

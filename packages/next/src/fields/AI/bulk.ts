import { type AIKind, aiFieldPaths, isAIFieldInputSet } from 'frogbot/fields';
import type {
  ClientCollectionConfig,
  ClientField,
  FieldAffectingDataClient,
  ListQuery,
  ViewTypes,
  Where,
} from 'payload';
import {
  combineWhereConstraints,
  flattenTopLevelFields,
  mergeListSearchAndWhere,
} from 'payload/shared';

import { appendQuery } from '../../views/cells.js';
import { getFieldKind } from '../kind.js';

export type AIBulkChoice = 'all' | 'generated' | 'failed' | 'never';

export type AIBulkField = {
  inputs: AIKind['inputs'];
  label: FieldAffectingDataClient['label'];
  name: string;
};

export type AIBulkTarget = { draft: boolean; id: number | string };

export type AIBulkScope = { hasSelection: boolean; where: Where };

export type AIBulkRequest = { body: Record<string, unknown>; url: string };

export type AIBulkResult = { message: string; type: 'error' | 'info' | 'success' };

type AIBulkGroup = {
  body: Record<string, unknown>;
  status?: 'draft' | 'published';
  targets: AIBulkTarget[];
};

export const AI_BULK_CHUNK_SIZE = 100;

const SKIPPED_REASONS = '(no inputs, no permission, being edited, or changed)';

function plural({ count, noun }: { count: number; noun: string }): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += AI_BULK_CHUNK_SIZE) {
    chunks.push(items.slice(index, index + AI_BULK_CHUNK_SIZE));
  }

  return chunks;
}

export function aiBulkMenuFields({
  canUpdate,
  fields,
  isInDrawer,
  viewType,
}: {
  canUpdate: boolean;
  fields: ClientField[];
  isInDrawer: boolean;
  viewType?: ViewTypes;
}): AIBulkField[] {
  if (!canUpdate || isInDrawer || viewType === 'trash') return [];

  return flattenTopLevelFields(fields).flatMap((field) => {
    const kind = getFieldKind(field as ClientField);

    if (kind?.type !== 'ai' || !('name' in field) || !field.name) return [];

    const { inputs } = kind as AIKind;

    return [{ inputs, label: 'label' in field ? field.label : undefined, name: field.name }];
  });
}

export function aiBulkScope({
  collectionConfig,
  query,
  selectAll,
  selectedIDs,
}: {
  collectionConfig: ClientCollectionConfig;
  query: ListQuery;
  selectAll: string;
  selectedIDs: (number | string)[];
}): AIBulkScope {
  if (selectAll === 'some' || selectAll === 'allInPage') {
    return { hasSelection: true, where: { id: { in: selectedIDs } } };
  }

  const where = combineWhereConstraints([
    query.where,
    mergeListSearchAndWhere({ collectionConfig, search: query.search ?? '' }),
  ]);

  return { hasSelection: selectAll !== 'none', where };
}

export function aiBulkChoiceFilter({
  choice,
  statusPath,
}: {
  choice: AIBulkChoice;
  statusPath: string;
}): Where {
  switch (choice) {
    case 'all':
      return {
        or: [
          { [statusPath]: { exists: false } },
          { [statusPath]: { in: ['done', 'error', 'manual'] } },
        ],
      };

    case 'generated':
      return { [statusPath]: { equals: 'done' } };

    case 'failed':
      return { [statusPath]: { equals: 'error' } };

    case 'never':
      return { [statusPath]: { exists: false } };
  }
}

export function aiBulkLoadURL({
  api,
  choice,
  collectionSlug,
  drafts,
  field,
  locale,
  where,
}: {
  api: string;
  choice: AIBulkChoice;
  collectionSlug: string;
  drafts: boolean;
  field: AIBulkField;
  locale?: string;
  where: Where;
}): string {
  const filter = aiBulkChoiceFilter({ choice, statusPath: aiFieldPaths(field.name).status });
  const select = [...field.inputs, ...(drafts ? ['_status'] : [])];

  const params = new URLSearchParams({ depth: '0', pagination: 'false' });

  appendQuery(params, 'where', combineWhereConstraints([where, filter]));
  appendQuery(params, 'select', Object.fromEntries(select.map((path) => [path, true])));
  appendQuery(params, 'locale', locale);
  appendQuery(params, 'fallback-locale', locale && 'none');

  if (drafts) params.set('draft', 'true');

  return `${api}/${collectionSlug}?${params}`;
}

export function aiBulkTargets({
  docs,
  drafts,
  field,
}: {
  docs: Record<string, unknown>[];
  drafts: boolean;
  field: AIBulkField;
}): AIBulkTarget[] {
  return docs.flatMap((doc) => {
    if (!field.inputs.some((input) => isAIFieldInputSet(doc[input]))) return [];

    return [{ draft: drafts && doc._status === 'draft', id: doc.id as number | string }];
  });
}

export function aiBulkRequests({
  api,
  choice,
  collectionSlug,
  drafts,
  field,
  locale,
  targets,
}: {
  api: string;
  choice: AIBulkChoice;
  collectionSlug: string;
  drafts: boolean;
  field: AIBulkField;
  locale?: string;
  targets: AIBulkTarget[];
}): AIBulkRequest[] {
  const statusPath = aiFieldPaths(field.name).status;
  const filter = aiBulkChoiceFilter({ choice, statusPath });
  const pending = { [statusPath]: 'pending' };

  const groups: AIBulkGroup[] = drafts
    ? [
        { body: pending, status: 'draft', targets: targets.filter(({ draft }) => draft) },
        {
          body: { _status: 'published', ...pending },
          status: 'published',
          targets: targets.filter(({ draft }) => !draft),
        },
      ]
    : [{ body: pending, targets }];

  return groups.flatMap(({ body, status, targets: group }) =>
    chunk(group).map((batch) => {
      const params = new URLSearchParams({ depth: '0' });

      appendQuery(params, 'where', {
        and: [
          { id: { in: batch.map(({ id }) => id) } },
          filter,
          ...(status ? [{ _status: { equals: status } }] : []),
        ],
      });
      appendQuery(params, 'locale', locale);

      if (status) params.set('draft', 'true');

      return { body, url: `${api}/${collectionSlug}?${params}` };
    }),
  );
}

export function aiBulkResultMessage({
  error,
  loaded,
  queued,
}: {
  error?: { message?: string };
  loaded: number;
  queued: number;
}): AIBulkResult {
  const runs = `Queued ${plural({ count: queued, noun: 'run' })}`;
  const skipped = Math.max(loaded - queued, 0);
  const skippedText = `${plural({ count: skipped, noun: 'record' })} skipped ${SKIPPED_REASONS}`;

  if (error) {
    const message = error.message || "Couldn't queue the runs.";

    return {
      message:
        queued > 0
          ? `${message} · ${plural({ count: queued, noun: 'run' })} already queued`
          : message,
      type: 'error',
    };
  }

  if (loaded === 0) return { message: `${runs} · no records matched`, type: 'info' };

  if (queued === 0) return { message: `${runs} · ${skippedText}`, type: 'info' };

  return { message: skipped > 0 ? `${runs} · ${skippedText}` : runs, type: 'success' };
}

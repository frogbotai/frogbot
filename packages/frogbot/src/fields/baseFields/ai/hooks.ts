import { isDeepStrictEqual } from 'node:util';

import type { Field, FieldHook } from '../../config/types.js';
import { aiFieldPaths, type AIFieldStatus, type AIKind, isAIFieldInputSet } from './state.js';

export const AI_FIELD_TASK_SLUG = 'frogbot-run-ai-field';

export const AI_FIELD_RUN_CONTEXT = 'frogbotAIFieldRun';

export function getAIKind(field: Field): AIKind | undefined {
  const admin = 'admin' in field ? (field.admin as { custom?: unknown } | undefined) : undefined;
  const custom = admin?.custom as { frogbot?: { kind?: { type?: unknown } } } | undefined;
  const kind = custom?.frogbot?.kind;

  return kind?.type === 'ai' ? (kind as AIKind) : undefined;
}

type RecordID = number | string;

export type AIFieldRun = { collection: string; id: RecordID; field: string };

export type AIFieldRunContext = AIFieldRun & { isCurrent?: () => Promise<boolean> };

export type AIFieldRunInput = AIFieldRun & {
  locale?: string;
  user?: { collection: string; id: RecordID };
};

type Doc = Record<string, unknown> | undefined;

type AIFieldHookSpec = { kind: AIKind; name: string };

export type NextAIFieldStatusArgs = AIFieldHookSpec & {
  data: Doc;
  operation: string | undefined;
  originalDoc: Doc;
  ownRun: boolean;
};

export type ShouldQueueAIFieldRunArgs = AIFieldHookSpec & {
  doc: Doc;
  operation: string | undefined;
  ownRun: boolean;
  previousDoc: Doc;
};

function emptyToNull(value: unknown): unknown {
  return isAIFieldInputSet(value) ? value : null;
}

function keyChanged({ data, key, original }: { data: Doc; key: string; original: Doc }): boolean {
  if (!data || !(key in data)) return false;

  return !isDeepStrictEqual(emptyToNull(data[key]), emptyToNull(original?.[key]));
}

function inputChanged({
  data,
  inputs,
  operation,
  original,
}: {
  data: Doc;
  inputs: string[];
  operation: string | undefined;
  original: Doc;
}): boolean {
  if (operation === 'create') return inputs.some((input) => isAIFieldInputSet(data?.[input]));

  return inputs.some((key) => keyChanged({ data, key, original }));
}

export function isOwnAIFieldRun({
  collection,
  context,
  field,
  id,
}: {
  collection: string | undefined;
  context: Record<string, unknown> | undefined;
  field: string;
  id: unknown;
}): boolean {
  const run = context?.[AI_FIELD_RUN_CONTEXT] as Partial<AIFieldRun> | undefined;

  if (!run || id === undefined || id === null) return false;

  return run.collection === collection && run.field === field && String(run.id) === String(id);
}

export function nextAIFieldStatus({
  data,
  kind,
  name,
  operation,
  originalDoc,
  ownRun,
}: NextAIFieldStatusArgs): AIFieldStatus | null {
  const { status } = aiFieldPaths(name);
  const incoming = data?.[status] as AIFieldStatus | null | undefined;
  const stored = (originalDoc?.[status] ?? null) as AIFieldStatus | null;

  if (ownRun) return incoming ?? stored;

  if (incoming === 'pending' && stored !== 'pending') return 'pending';

  const valueEdited =
    operation === 'create'
      ? isAIFieldInputSet(data?.[name])
      : keyChanged({ data, key: name, original: originalDoc });

  if (valueEdited || stored === 'manual') return 'manual';

  if (inputChanged({ data, inputs: kind.inputs, operation, original: originalDoc })) {
    return 'pending';
  }

  return stored;
}

export function nextAIFieldError(args: NextAIFieldStatusArgs): string | null {
  const { data, name, originalDoc, ownRun } = args;
  const paths = aiFieldPaths(name);
  const status = nextAIFieldStatus(args);

  if (ownRun && status === 'error') return (data?.[paths.error] ?? null) as string | null;

  if (status !== (originalDoc?.[paths.status] ?? null)) return null;

  return (originalDoc?.[paths.error] ?? null) as string | null;
}

export function shouldQueueAIFieldRun({
  doc,
  kind,
  name,
  operation,
  ownRun,
  previousDoc,
}: ShouldQueueAIFieldRunArgs): boolean {
  const { status } = aiFieldPaths(name);

  if (ownRun || doc?.[status] !== 'pending') return false;

  if (previousDoc?.[status] !== 'pending') return true;

  return inputChanged({ data: doc, inputs: kind.inputs, operation, original: previousDoc });
}

function statusArgs(
  { kind, name }: AIFieldHookSpec,
  { collection, context, data, operation, originalDoc }: Parameters<FieldHook>[0],
): NextAIFieldStatusArgs {
  const id = originalDoc?.id;

  return {
    data,
    kind,
    name,
    operation,
    originalDoc,
    ownRun: isOwnAIFieldRun({ collection: collection?.slug, context, field: name, id }),
  };
}

export function aiFieldRunGuardHook({ name, path }: { name: string; path: string }): FieldHook {
  return async ({ collection, context, originalDoc, value }) => {
    const run = context?.[AI_FIELD_RUN_CONTEXT] as Partial<AIFieldRunContext> | undefined;
    const id = originalDoc?.id;
    const ownRun = isOwnAIFieldRun({ collection: collection?.slug, context, field: name, id });

    if (!ownRun || !run?.isCurrent || (await run.isCurrent())) return value;

    return originalDoc?.[path] ?? null;
  };
}

export function aiFieldStatusHook(spec: AIFieldHookSpec): FieldHook {
  return (args) => nextAIFieldStatus(statusArgs(spec, args));
}

export function aiFieldErrorHook(spec: AIFieldHookSpec): FieldHook {
  return (args) => nextAIFieldError(statusArgs(spec, args));
}

function savedAIFieldDoc({
  data,
  doc,
  kind,
  name,
  operation,
  ownRun,
  previousDoc,
}: AIFieldHookSpec & {
  data: Doc;
  doc: Doc;
  operation: string | undefined;
  ownRun: boolean;
  previousDoc: Doc;
}): Record<string, unknown> {
  const { status } = aiFieldPaths(name);
  const saved = { ...previousDoc, ...data, ...doc };

  if (doc && status in doc) return saved;

  return {
    ...saved,
    [status]: nextAIFieldStatus({ data, kind, name, operation, originalDoc: previousDoc, ownRun }),
  };
}

export function aiFieldQueueHook({ kind, name }: AIFieldHookSpec): FieldHook {
  return async (args) => {
    const { collection, context, data, operation, previousDoc, req, value } = args;
    const slug = collection?.slug;
    const id = args.originalDoc?.id ?? previousDoc?.id;
    const ownRun = isOwnAIFieldRun({ collection: slug, context, field: name, id });

    const doc = savedAIFieldDoc({
      data,
      doc: args.originalDoc,
      kind,
      name,
      operation,
      ownRun,
      previousDoc,
    });

    if (!slug || !shouldQueueAIFieldRun({ doc, kind, name, operation, ownRun, previousDoc })) {
      return value;
    }

    const user = req.user as { collection: string; id: RecordID } | null;

    const input: AIFieldRunInput = {
      collection: slug,
      id: id as RecordID,
      field: name,
      ...(req.locale ? { locale: req.locale } : {}),
      ...(user ? { user: { collection: user.collection, id: user.id } } : {}),
    };

    await req.frogbot.jobs.queue({ task: AI_FIELD_TASK_SLUG, input, req } as never);

    return value;
  };
}

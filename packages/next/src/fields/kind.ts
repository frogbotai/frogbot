import type { ClientField } from 'payload';

export type FieldKind = { type: string } & Record<string, unknown>;

export function getFieldKind(field: ClientField): FieldKind | undefined {
  const kind: unknown = field.admin?.custom?.frogbot?.kind;

  if (!kind || typeof kind !== 'object') return undefined;

  if (typeof (kind as { type?: unknown }).type !== 'string') return undefined;

  return kind as FieldKind;
}

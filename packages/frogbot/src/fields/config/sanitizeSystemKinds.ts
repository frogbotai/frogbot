import type { Field } from './types.js';

type SystemKindOwner =
  { block?: undefined; collection: string } | { block: string; collection?: undefined };

type SanitizeSystemKindArgs = SystemKindOwner & {
  field: Field;
  label: string;
  onAutonumber?: (path: string) => void;
  path: string;
  repeated: boolean;
  type: SystemKindType;
};

type SystemKindType = 'autonumber';

const systemKindLabels: Record<SystemKindType, string> = {
  autonumber: 'Autonumber',
};

export function getSystemKind(field: Field): { label: string; type: SystemKindType } | undefined {
  const admin = 'admin' in field ? (field.admin as { custom?: unknown } | undefined) : undefined;
  const custom = admin?.custom as { frogbot?: { kind?: { type?: unknown } } } | undefined;
  const type = custom?.frogbot?.kind?.type;

  if (typeof type !== 'string' || !Object.hasOwn(systemKindLabels, type)) return undefined;

  return { label: systemKindLabels[type as SystemKindType], type: type as SystemKindType };
}

export function sanitizeSystemKind({
  block,
  collection,
  field,
  label,
  onAutonumber,
  path,
  repeated,
}: SanitizeSystemKindArgs): Field {
  const owner = collection ? `collection '${collection}'` : `block '${block}'`;

  if (repeated) {
    throw new Error(
      `[frogbot] ${label} field '${path}' in ${owner} can't be inside an array or blocks.`,
    );
  }

  onAutonumber?.(path);

  return field;
}

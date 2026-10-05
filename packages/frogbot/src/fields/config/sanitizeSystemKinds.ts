import type { Field } from './types.js';

export type SystemKindUsers = {
  authSlugs: string[];
  resolve: () => string;
};

type SystemKindOwner =
  { block?: undefined; collection: string } | { block: string; collection?: undefined };

type SanitizeSystemKindArgs = SystemKindOwner & {
  field: Field;
  label: string;
  onAutonumber?: (path: string) => void;
  path: string;
  repeated: boolean;
  type: SystemKindType;
  users: SystemKindUsers;
};

type SystemKindType = 'autonumber' | 'createdBy' | 'lastModifiedBy';

const systemKindLabels: Record<SystemKindType, string> = {
  autonumber: 'Autonumber',
  createdBy: 'Created by',
  lastModifiedBy: 'Last modified by',
};

export function getSystemKind(field: Field): { label: string; type: SystemKindType } | undefined {
  const admin = 'admin' in field ? (field.admin as { custom?: unknown } | undefined) : undefined;
  const custom = admin?.custom as { frogbot?: { kind?: { type?: unknown } } } | undefined;
  const type = custom?.frogbot?.kind?.type;

  if (typeof type !== 'string' || !Object.hasOwn(systemKindLabels, type)) return undefined;

  return { label: systemKindLabels[type as SystemKindType], type: type as SystemKindType };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.replace(/^\[frogbot\] /, '');
}

export function sanitizeSystemKind({
  block,
  collection,
  field,
  label,
  onAutonumber,
  path,
  repeated,
  type,
  users,
}: SanitizeSystemKindArgs): Field {
  const owner = collection ? `collection '${collection}'` : `block '${block}'`;
  const name = `${label} field '${path}' in ${owner}`;

  if (repeated) {
    throw new Error(`[frogbot] ${name} can't be inside an array or blocks.`);
  }

  if (type === 'autonumber') {
    onAutonumber?.(path);

    return field;
  }

  const given = 'relationTo' in field ? field.relationTo : undefined;
  let relationTo: unknown = given;

  if (relationTo === undefined) {
    try {
      relationTo = users.resolve();
    } catch (error) {
      throw new Error(`[frogbot] ${name}: ${errorMessage(error)}`, { cause: error });
    }
  }

  if (typeof relationTo !== 'string' || !users.authSlugs.includes(relationTo)) {
    throw new Error(
      `[frogbot] ${name} must point at an auth collection; '${String(relationTo)}' is not one.`,
    );
  }

  return given === undefined ? ({ ...field, relationTo } as Field) : field;
}

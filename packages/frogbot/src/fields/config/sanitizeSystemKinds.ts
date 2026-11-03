import type { AutonumberScope } from '../../config/sanitized.js';
import type { Field } from './types.js';

type SystemKindOwner =
  { block?: undefined; collection: string } | { block: string; collection?: undefined };

export type OnAutonumber = (path: string, scope?: AutonumberScope) => void;

export type OnAutonumberKey = (
  path: string,
  key: { number: { name: string; path: string }; prefix: string },
) => void;

type SanitizeSystemKindArgs = SystemKindOwner &
  SystemKind & {
    field: Field;
    onAutonumber?: OnAutonumber;
    onAutonumberKey?: OnAutonumberKey;
    parent: string;
    path: string;
    repeated: boolean;
  };

type SystemKindType = 'autonumber' | 'autonumberKey';

type SystemKind = {
  label: string;
  number?: string;
  prefix?: string;
  scope?: string;
  type: SystemKindType;
};

const systemKindLabels: Record<SystemKindType, string> = {
  autonumber: 'Autonumber',
  autonumberKey: 'Autonumber key',
};

export function getSystemKind(field: Field): SystemKind | undefined {
  const admin = 'admin' in field ? (field.admin as { custom?: unknown } | undefined) : undefined;
  const custom = admin?.custom as { frogbot?: { kind?: Record<string, unknown> } } | undefined;

  const kind = custom?.frogbot?.kind;
  const type = kind?.type;

  if (typeof type !== 'string' || !Object.hasOwn(systemKindLabels, type)) return undefined;

  const option = (name: 'number' | 'prefix' | 'scope') =>
    typeof kind?.[name] === 'string' ? { [name]: kind[name] } : {};

  return {
    label: systemKindLabels[type as SystemKindType],
    type: type as SystemKindType,
    ...option('scope'),
    ...option('number'),
    ...option('prefix'),
  };
}

function joinPath(parent: string, name: string): string {
  return [parent, name].filter(Boolean).join('.');
}

export function sanitizeSystemKind({
  block,
  collection,
  field,
  label,
  number,
  onAutonumber,
  onAutonumberKey,
  parent,
  path,
  prefix,
  repeated,
  scope,
  type,
}: SanitizeSystemKindArgs): Field {
  const owner = collection ? `collection '${collection}'` : `block '${block}'`;

  if (repeated) {
    throw new Error(
      `[frogbot] ${label} field '${path}' in ${owner} can't be inside an array or blocks.`,
    );
  }

  if (type === 'autonumberKey') {
    if (number && prefix) {
      onAutonumberKey?.(path, { number: { name: number, path: joinPath(parent, number) }, prefix });
    }

    return field;
  }

  onAutonumber?.(path, scope ? { name: scope, path: joinPath(parent, scope) } : undefined);

  return field;
}

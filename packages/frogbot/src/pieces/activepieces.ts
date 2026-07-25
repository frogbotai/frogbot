import { z } from 'zod';

type ActivepiecesProperty = {
  type: string;
  displayName?: string;
  description?: string;
  required?: boolean;
  properties?: Record<string, ActivepiecesProperty>;
};

type ActivepiecesAction = {
  name: string;
  displayName: string;
  description: string;
  props: Record<string, ActivepiecesProperty>;
  run: (context: Record<string, unknown>) => Promise<unknown>;
};

export type ActivepiecesPiece = {
  metadata: () => Record<string, unknown>;
  actions: () => Record<string, ActivepiecesAction>;
  getAction: (name: string) => ActivepiecesAction | undefined;
};

export class UnsupportedPieceContextError extends Error {
  constructor(capability: string) {
    super(`[frogbot] Activepieces context '${capability}' is not supported yet.`);
    this.name = 'UnsupportedPieceContextError';
  }
}

function unsupported(capability: string): object {
  return new Proxy({}, { get: () => { throw new UnsupportedPieceContextError(capability); } });
}

export function loadActivepiecesPiece(module: Record<string, unknown>): ActivepiecesPiece {
  const matches = Object.values(module).filter((value): value is ActivepiecesPiece => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<ActivepiecesPiece>;
    return typeof candidate.metadata === 'function' && typeof candidate.actions === 'function' && typeof candidate.getAction === 'function';
  });
  if (matches.length !== 1) {
    throw new Error(`[frogbot] Expected exactly one Activepieces piece export, found ${matches.length}.`);
  }
  return matches[0];
}

function propertySchema(property: ActivepiecesProperty): z.ZodType {
  let schema: z.ZodType;
  switch (property.type) {
    case 'NUMBER':
      schema = z.number();
      break;
    case 'CHECKBOX':
      schema = z.boolean();
      break;
    case 'ARRAY':
      schema = z.array(z.unknown());
      break;
    case 'OBJECT':
      schema = property.properties ? propertiesSchema(property.properties) : z.record(z.string(), z.unknown());
      break;
    case 'JSON':
      schema = z.unknown();
      break;
    case 'MULTI_SELECT_DROPDOWN':
    case 'STATIC_MULTI_SELECT_DROPDOWN':
      schema = z.array(z.string());
      break;
    default:
      schema = z.string();
  }
  if (property.description) schema = schema.describe(property.description);
  return property.required ? schema : schema.optional();
}

export function propertiesSchema(properties: Record<string, ActivepiecesProperty>): z.ZodObject<Record<string, z.ZodType>> {
  return z.object(Object.fromEntries(Object.entries(properties).map(([name, property]) => [name, propertySchema(property)])));
}

export async function executeActivepiecesAction({
  action,
  propsValue,
  auth,
}: {
  action: ActivepiecesAction;
  propsValue: Record<string, unknown>;
  auth?: unknown;
}): Promise<unknown> {
  return action.run({
    auth,
    propsValue,
    executionType: 'BEGIN',
    store: unsupported('store'),
    files: unsupported('files'),
    connections: unsupported('connections'),
    server: unsupported('server'),
    flows: unsupported('flows'),
    step: unsupported('step'),
    project: unsupported('project'),
    tags: unsupported('tags'),
    output: unsupported('output'),
    agent: unsupported('agent'),
    run: unsupported('run'),
  });
}

import { z } from 'zod';

import type { ToolCtx } from '../types/tool.js';

type ActivepiecesProperty = {
  type: string;
  displayName?: string;
  description?: string;
  required?: boolean;
  properties?: Record<string, ActivepiecesProperty>;
  options?: { options?: { value: string | number | boolean | null }[] };
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

function optionSchema(values: (string | number | boolean | null)[], fallback: z.ZodType): z.ZodType {
  if (values.length === 0) return fallback;
  if (values.length === 1) return z.literal(values[0]!);
  return z.union([z.literal(values[0]!), z.literal(values[1]!), ...values.slice(2).map((value) => z.literal(value))]);
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
    case 'DYNAMIC':
      schema = z.record(z.string(), z.unknown());
      break;
    case 'STATIC_DROPDOWN': {
      const values = property.options?.options?.map((option) => option.value) ?? [];
      schema = optionSchema(values, z.string());
      break;
    }
    case 'MULTI_SELECT_DROPDOWN':
    case 'STATIC_MULTI_SELECT_DROPDOWN':
      schema = property.options?.options?.length
        ? z.array(optionSchema(property.options.options.map((option) => option.value), z.string()))
        : z.array(z.string());
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

async function resolveProps(properties: Record<string, ActivepiecesProperty>, values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resolved = { ...values };
  for (const [name, property] of Object.entries(properties)) {
    const value = values[name];
    if (property.type === 'FILE' && typeof value === 'string') {
      const response = await fetch(value);
      if (!response.ok) throw new Error(`[frogbot] Failed to download piece file '${value}': ${response.status}.`);
      const fileName = new URL(value).pathname.split('/').pop() || 'file';
      resolved[name] = {
        data: Buffer.from(await response.arrayBuffer()),
        filename: fileName,
        extension: fileName.includes('.') ? fileName.split('.').pop() : undefined,
      };
    }
  }
  return resolved;
}

export async function executeActivepiecesAction({
  action,
  propsValue,
  auth,
  ctx,
}: {
  action: ActivepiecesAction;
  propsValue: Record<string, unknown>;
  auth?: unknown;
  ctx?: ToolCtx;
}): Promise<unknown> {
  return action.run({
    auth,
    propsValue: await resolveProps(action.props, propsValue),
    executionType: 'BEGIN',
    store: unsupported('store'),
    files: {
      write: async ({ fileName, data }: { fileName: string; data: Buffer }) => {
        const collection = ctx?.frogbot.config.pieceFiles?.collection;
        if (!ctx || !collection) {
          throw new Error('[frogbot] Piece file output requires `pieceFiles.collection` to be configured.');
        }
        const doc = await ctx.frogbot.create({
          collection,
          data: {},
          file: { data, mimetype: 'application/octet-stream', name: fileName, size: data.length },
          overrideAccess: true,
        });
        const url = (doc as Record<string, unknown>).url;
        if (typeof url !== 'string' || !url) {
          throw new Error(`[frogbot] Upload collection '${collection}' did not return a file URL.`);
        }
        return url;
      },
    },
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

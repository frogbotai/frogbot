import { z } from 'zod';

import { resolveUserSlug } from '../chat/resolveUserSlug.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { FrogbotConfig } from '../config/types.js';
import { isPieceInstance, pieceInstanceDefinition } from '../pieces/definePiece.js';
import { defaultConnectionsCollection } from './collection.js';
import { createCredentialEncryption } from './encryption.js';
import { buildConnectionOAuthEndpoints } from './endpoints.js';
import type {
  ConnectionSchema,
  SanitizedConnectionEntry,
  SanitizedConnectionsConfig,
} from './types.js';

export const DEFAULT_CONNECTIONS_SLUG = 'connections';

function isRenderableSchema(schema: ConnectionSchema | boolean): boolean {
  if (typeof schema === 'boolean' || schema.$ref || schema.allOf || schema.oneOf || schema.not) {
    return false;
  }
  if (schema.anyOf) {
    const values = schema.anyOf.filter(
      (entry) => typeof entry === 'boolean' || entry.type !== 'null',
    );
    return values.length === 1 && isRenderableSchema(values[0]!);
  }
  if (schema.type === 'object') {
    const fields = Object.values(schema.properties ?? {});
    return (
      fields.length > 0 &&
      fields.every(isRenderableSchema) &&
      (schema.additionalProperties === undefined || schema.additionalProperties === false)
    );
  }
  if (schema.type === 'array') {
    return !!schema.items && !Array.isArray(schema.items) && isRenderableSchema(schema.items);
  }
  return ['string', 'number', 'integer', 'boolean'].includes(schema.type as string);
}

function resolveEntries(config: FrogbotConfig): SanitizedConnectionsConfig['entries'] {
  if ('credentialSources' in config) {
    throw new Error(
      '[frogbot] `credentialSources` is no longer supported. Configure `connections` entries.',
    );
  }
  if (config.connections !== undefined && !Array.isArray(config.connections)) {
    throw new Error('[frogbot] `connections` must be an array of connection entries.');
  }
  const entries: Record<string, SanitizedConnectionEntry> = Object.create(null);
  for (const entry of config.connections ?? []) {
    if (!entry || !isPieceInstance(entry.piece)) {
      throw new Error('[frogbot] Every connection entry requires a piece instance.');
    }
    const slug = entry.piece.piece;
    if (entries[slug]) {
      throw new Error(`[frogbot] Duplicate connection entry for piece '${slug}'.`);
    }
    for (const method of ['oauth', 'secret'] as const) {
      if (entry[method] !== undefined && typeof entry[method] !== 'boolean') {
        throw new Error(`[frogbot] Connection '${slug}' ${method} must be a boolean.`);
      }
    }
    const oauth = entry.oauth === true;
    const secret = entry.secret === true;
    if (!oauth && !secret) {
      throw new Error(`[frogbot] Connection '${slug}' requires oauth: true or secret: true.`);
    }
    const definition = pieceInstanceDefinition(entry.piece);
    if (oauth && !definition.oauth) {
      throw new Error(`[frogbot] Connection '${slug}' requires the piece's OAuth recipe.`);
    }
    const app = entry.piece.oauth;
    if (
      oauth &&
      (typeof app?.clientId !== 'string' ||
        !app.clientId.trim() ||
        typeof app.clientSecret !== 'string' ||
        !app.clientSecret.trim())
    ) {
      throw new Error(
        `[frogbot] Connection '${slug}' requires factory OAuth clientId and clientSecret.`,
      );
    }
    let secretSchema: ConnectionSchema | undefined;
    if (secret) {
      try {
        if (definition.auth) secretSchema = z.toJSONSchema(definition.auth, { io: 'input' });
      } catch {
        secretSchema = undefined;
      }
      if (!secretSchema || !isRenderableSchema(secretSchema)) {
        throw new Error(
          `[frogbot] Connection '${slug}' requires a user-enterable static credential schema.`,
        );
      }
    }
    entries[slug] = { piece: entry.piece, oauth, secret, ...(secret ? { secretSchema } : {}) };
  }
  return entries;
}

export function resolveConnectionsCollections(config: FrogbotConfig): {
  collections: CollectionConfig[];
  connections: SanitizedConnectionsConfig;
} {
  if (config.collections.some((collection) => collection.slug === DEFAULT_CONNECTIONS_SLUG)) {
    throw new Error(
      `[frogbot] Collection slug '${DEFAULT_CONNECTIONS_SLUG}' is reserved for the connections API.`,
    );
  }
  if (config.collections.some((collection) => 'connections' in collection)) {
    throw new Error(
      '[frogbot] The collection `connections` marker is no longer supported. Configure root `connections` entries.',
    );
  }
  const entries = resolveEntries(config);
  const enabled = Object.keys(entries).length > 0;
  const encryption = createCredentialEncryption({ secret: config.secret });
  if (!enabled) {
    return {
      collections: config.collections,
      connections: { enabled: false, encryption, entries },
    };
  }

  const slug = DEFAULT_CONNECTIONS_SLUG;
  const userSlug = resolveUserSlug(config);
  const base = defaultConnectionsCollection({ slug, userSlug });
  const connections = { enabled: true, slug, encryption, entries };
  base.endpoints = buildConnectionOAuthEndpoints({ connections, userSlug });
  return {
    collections: [...config.collections, base],
    connections,
  };
}

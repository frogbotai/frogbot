import { providerKeyEnvVar } from '@frogbotai/gateway';
import { z } from 'zod';

import { isProviderName } from '../ai/providerNames.js';
import { resolveUserSlug } from '../chat/resolveUserSlug.js';
import { cascadeDelete } from '../collections/config/cascadeDelete.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { FrogBotConfig } from '../config/types.js';
import { isPieceInstance, pieceInstanceDefinition } from '../pieces/definePiece.js';
import { isPieceSignIn } from '../pieces/oauth.js';
import type { PieceInstance } from '../pieces/types.js';
import { defaultConnectionsCollection } from './collection.js';
import { createCredentialEncryption } from './encryption.js';
import { buildConnectionOAuthEndpoints } from './endpoints.js';
import { oauthScopes } from './oauth/scopes.js';
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

    return values.length === 1 && isRenderableSchema(values[0]);
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

function resolveEntries(
  config: FrogBotConfig,
): Pick<SanitizedConnectionsConfig, 'apps' | 'entries'> {
  if ('credentialSources' in config) {
    throw new Error(
      '[frogbot] `credentialSources` is no longer supported. Configure `connections` entries.',
    );
  }

  if (config.connections !== undefined && !Array.isArray(config.connections)) {
    throw new Error('[frogbot] `connections` must be an array of connection entries.');
  }

  const entries: Record<string, SanitizedConnectionEntry> = Object.create(null);
  const apps: Record<string, Record<string, SanitizedConnectionEntry>> = Object.create(null);

  for (const entry of config.connections ?? []) {
    if (!entry || !isPieceInstance(entry.piece)) {
      throw new Error('[frogbot] Every connection entry requires a piece instance.');
    }

    const slug = entry.piece.piece;
    const slot = entry.app;
    if (
      slot !== undefined &&
      (typeof slot !== 'string' ||
        !slot.trim() ||
        slot !== slot.trim() ||
        encodeURIComponent(slot) !== slot)
    ) {
      throw new Error(`[frogbot] Connection '${slug}' app '${String(slot)}' is not URL-safe.`);
    }

    const target: Record<string, SanitizedConnectionEntry> =
      slot === undefined ? entries : (apps[slot] ??= Object.create(null));

    if (target[slug]) {
      throw new Error(
        slot === undefined
          ? `[frogbot] Duplicate connection entry for piece '${slug}'.`
          : `[frogbot] Duplicate connection entry for piece '${slug}' in app '${slot}'.`,
      );
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
      !isPieceSignIn(definition.oauth) &&
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

    const icon = definition.admin?.icon;

    target[slug] = {
      piece: entry.piece,
      oauth,
      secret,
      ...(oauth ? { scopes: oauthScopes(entry.piece) } : {}),
      ...(oauth && definition.oauth?.label ? { oauthLabel: definition.oauth.label.trim() } : {}),
      ...(secret ? { secretSchema } : {}),
      ...(typeof icon === 'string' && icon.trim() ? { icon: icon.trim() } : {}),
    };
  }

  return { entries, apps };
}

/** The AI providers that users' `connections` pieces link to, each with its piece. App slots don't. */
export function resolveLinkedProviders(config: FrogBotConfig): Record<string, PieceInstance> {
  const linked: Record<string, PieceInstance> = Object.create(null);

  for (const entry of Array.isArray(config.connections) ? config.connections : []) {
    if (!isPieceInstance(entry?.piece) || entry.app !== undefined) continue;

    const provider = pieceInstanceDefinition(entry.piece).provider;

    if (!provider) continue;

    if (!isProviderName(provider.name) || !providerKeyEnvVar(provider.name)) {
      throw new Error(
        `[frogbot] Piece '${entry.piece.piece}' provider '${provider.name}' is not a built-in API-key AI provider.`,
      );
    }

    const existing = linked[provider.name];

    if (existing) {
      throw new Error(
        `[frogbot] Pieces '${existing.piece}' and '${entry.piece.piece}' both link the AI provider '${provider.name}'.`,
      );
    }

    linked[provider.name] = entry.piece;
  }

  return linked;
}

export function resolveConnectionsCollections(config: FrogBotConfig): {
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

  const { entries, apps } = resolveEntries(config);
  const enabled = Object.keys(entries).length > 0 || Object.keys(apps).length > 0;
  const encryption = createCredentialEncryption({ secret: config.secret });
  if (!enabled) {
    return {
      collections: config.collections,
      connections: { enabled: false, encryption, entries, apps },
    };
  }

  const slug = DEFAULT_CONNECTIONS_SLUG;
  const userSlug = resolveUserSlug(config);
  const base = defaultConnectionsCollection({ slug, userSlug });
  const connections = { enabled: true, slug, encryption, entries, apps };
  base.endpoints = buildConnectionOAuthEndpoints({ connections, userSlug });

  return {
    collections: [
      ...config.collections.map((collection) =>
        collection.slug === userSlug
          ? cascadeDelete(collection, { collection: slug, field: 'owner' })
          : collection,
      ),
      base,
    ],
    connections,
  };
}

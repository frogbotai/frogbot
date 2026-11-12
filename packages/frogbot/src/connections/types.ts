import type { z } from 'zod';

import type { CredentialEncryption } from '../connections/encryption.js';
import type { pieceCapabilities, PieceInstance } from '../pieces/types.js';

type OAuthConnectionPiece = PieceInstance & {
  readonly [pieceCapabilities]:
    { factoryOAuth: true; oauth: object } | { pieceOAuth: true; oauth: object };
};

type SecretConnectionPiece = PieceInstance & {
  readonly [pieceCapabilities]: { staticAuth: true };
};

type ConnectionPiece =
  OAuthConnectionPiece | SecretConnectionPiece | (OAuthConnectionPiece & SecretConnectionPiece);

type ConnectionEntryMethods<TPiece extends PieceInstance> =
  | (TPiece extends OAuthConnectionPiece ? { piece: TPiece; oauth: true; secret?: never } : never)
  | (TPiece extends SecretConnectionPiece ? { piece: TPiece; oauth?: never; secret: true } : never)
  | (TPiece extends OAuthConnectionPiece & SecretConnectionPiece
      ? { piece: TPiece; oauth: true; secret: true }
      : never);

/**
 * A piece users link in Settings → Linked accounts. With `app`, the entry is a shared slot: an
 * admin links one account under that name, and call sites pick it with `as: '<app>'`.
 */
export type ConnectionEntry<TPiece extends PieceInstance = ConnectionPiece> =
  ConnectionEntryMethods<TPiece> & { app?: string };

export type ConnectionsConfig = ConnectionEntry[];

export type ConnectionSchema = z.core.JSONSchema.JSONSchema;

export type SanitizedConnectionEntry = {
  piece: PieceInstance;
  oauth: boolean;
  secret: boolean;
  scopes?: string[];
  /** The OAuth method's name in Linked accounts, from the recipe's `label`. */
  oauthLabel?: string;
  secretSchema?: ConnectionSchema;
  icon?: string;
};

export type SanitizedConnectionsConfig = {
  enabled: boolean;
  slug?: string;
  encryption: CredentialEncryption;
  /** Entries each user links for themselves, by piece slug. */
  entries: Readonly<Record<string, SanitizedConnectionEntry>>;
  /** Shared slots an admin links once, by slot name, then piece slug. */
  apps: Readonly<Record<string, Readonly<Record<string, SanitizedConnectionEntry>>>>;
};

/** Who a linked account belongs to: one user, or a named app slot. */
export type ConnectionHolder =
  | { owner: { id: number | string; collection: string }; app?: never }
  | { app: string; owner?: never };

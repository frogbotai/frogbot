import type { z } from 'zod';

import type { CredentialEncryption } from '../connections/encryption.js';
import type { pieceCapabilities, PieceInstance } from '../pieces/types.js';

type OAuthConnectionPiece = PieceInstance & {
  readonly [pieceCapabilities]: { factoryOAuth: true; oauth: object };
};

type SecretConnectionPiece = PieceInstance & {
  readonly [pieceCapabilities]: { staticAuth: true };
};

type ConnectionPiece =
  OAuthConnectionPiece | SecretConnectionPiece | (OAuthConnectionPiece & SecretConnectionPiece);

export type ConnectionEntry<TPiece extends PieceInstance = ConnectionPiece> =
  | (TPiece extends OAuthConnectionPiece ? { piece: TPiece; oauth: true; secret?: never } : never)
  | (TPiece extends SecretConnectionPiece ? { piece: TPiece; oauth?: never; secret: true } : never)
  | (TPiece extends OAuthConnectionPiece & SecretConnectionPiece
      ? { piece: TPiece; oauth: true; secret: true }
      : never);

export type ConnectionsConfig = ConnectionEntry[];

export type ConnectionSchema = z.core.JSONSchema.JSONSchema;

export type SanitizedConnectionEntry = {
  piece: PieceInstance;
  oauth: boolean;
  secret: boolean;
  secretSchema?: ConnectionSchema;
};

export type SanitizedConnectionsConfig = {
  enabled: boolean;
  slug?: string;
  encryption: CredentialEncryption;
  entries: Readonly<Record<string, SanitizedConnectionEntry>>;
};

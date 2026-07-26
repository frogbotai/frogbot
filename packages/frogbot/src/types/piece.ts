import type { AnyTool } from './tool.js';

export type CredentialType = 'none' | 'oauth2' | 'secret_text' | 'basic_auth' | 'custom' | 'service_account';

export type PieceAuth = Record<string, unknown> & { allowUserOverride?: boolean };

export type PiecePolicy =
  | { type: 'none' }
  | { type: 'developer'; credential: unknown }
  | { type: 'oauth'; clientId: string; clientSecret: string; source: PieceAuth }
  | { type: 'user' };

export type PieceFactoryConfig = {
  auth?: PieceAuth;
  separateConsent?: boolean;
};

export type PieceToolsOptions = {
  actions?: readonly string[];
};

export type Piece = {
  service: string;
  credentialType: CredentialType;
  policy: PiecePolicy;
  actions: readonly string[];
  tool: (action: string) => AnyTool;
  tools: (options?: PieceToolsOptions) => AnyTool[];
  credentialFields?: Readonly<Record<string, { secret?: boolean }>>;
  scopes?: readonly string[];
  separateConsent?: boolean;
};

export type PieceConfig = Piece;

export type SanitizedPiecesConfig =
  | { enabled: false; pieces: readonly []; services: Readonly<Record<string, Piece>>; tools: Readonly<Record<string, AnyTool>> }
  | { enabled: true; pieces: readonly Piece[]; services: Readonly<Record<string, Piece>>; tools: Readonly<Record<string, AnyTool>> };

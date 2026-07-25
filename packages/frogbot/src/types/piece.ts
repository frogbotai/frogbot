import type { AnyTool } from './tool.js';

export type CredentialType = 'none' | 'oauth2' | 'secret_text' | 'basic_auth' | 'custom';

export type PieceToolsOptions = {
  actions?: readonly string[];
};

export type Piece = {
  service: string;
  credentialType: CredentialType;
  actions: readonly string[];
  tools: (options?: PieceToolsOptions) => AnyTool[];
};

export type PieceConfig = Piece;

export type SanitizedPiecesConfig =
  | { enabled: false; pieces: readonly [] }
  | { enabled: true; pieces: readonly Piece[] };

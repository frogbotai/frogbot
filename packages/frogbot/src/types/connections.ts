import type { CredentialEncryption } from '../connections/encryption.js';
import type { CredentialType } from './piece.js';

export type CredentialSource = {
  key: string;
  services: readonly string[];
  credentialTypes: readonly Exclude<CredentialType, 'none'>[];
};

export type ConnectionsConfig = {
  encryption?: CredentialEncryption;
  assignments?: Record<string, string>;
};

export type SanitizedConnectionsConfig = {
  enabled: boolean;
  slug?: string;
  encryption: CredentialEncryption;
  sources: readonly CredentialSource[];
  assignments: Readonly<Record<string, string>>;
};

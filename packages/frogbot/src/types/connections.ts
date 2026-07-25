import type { TypeWithID } from 'payload';

import type { CredentialEncryption } from '../connections/encryption.js';
import type { ConnectionRecord } from '../connections/api.js';
import type { Frogbot } from '../frogbot.js';
import type { CredentialType } from './piece.js';

export type CredentialSource = {
  key: string;
  services: readonly string[];
  credentialTypes: readonly Exclude<CredentialType, 'none'>[];
  refresh?(context: { connection: ConnectionRecord; frogbot: Frogbot; owner: TypeWithID }): Promise<void>;
  revoke?(context: { connection: ConnectionRecord; frogbot: Frogbot; owner: TypeWithID }): Promise<void>;
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

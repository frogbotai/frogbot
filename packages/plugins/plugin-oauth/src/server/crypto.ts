import { CredentialCryptoError, createCredentialEncryption } from 'frogbot/connections';
import type { CredentialEncryption } from 'frogbot/connections';

/** @deprecated Use createCredentialEncryption from frogbot/connections. */
export const createOAuthEncryption = createCredentialEncryption;
/** @deprecated Use CredentialCryptoError from frogbot/connections. */
export const OAuthCryptoError = CredentialCryptoError;
/** @deprecated Use CredentialEncryption from frogbot/connections. */
export type OAuthEncryption = CredentialEncryption;

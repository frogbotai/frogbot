import type { CredentialSource, FrogbotRequest } from 'frogbot';

import { mergeOAuthTokenSets } from './server/tokens.js';
import type { OAuthEncryption } from './server/crypto.js';
import type { OAuthProvider, OAuthTokenSet } from './types.js';

function deserialize(value: string, expiresAt?: string): OAuthTokenSet {
  const credentials = JSON.parse(value) as Record<string, unknown>;
  return {
    accessToken: String(credentials.access_token ?? ''),
    ...(typeof credentials.refresh_token === 'string' ? { refreshToken: credentials.refresh_token } : {}),
    ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
    ...(typeof credentials.scope === 'string' ? { scopes: credentials.scope.split(' ').filter(Boolean) } : {}),
    ...(typeof credentials.token_type === 'string' ? { tokenType: credentials.token_type } : {}),
    ...(typeof credentials.id_token === 'string' ? { idToken: credentials.id_token } : {}),
    ...(typeof credentials.data === 'object' && credentials.data ? { metadata: credentials.data as Record<string, unknown> } : {}),
  };
}

function serialize(tokens: OAuthTokenSet): string {
  return JSON.stringify({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    scope: tokens.scopes?.join(' '),
    token_type: tokens.tokenType,
    id_token: tokens.idToken,
    data: tokens.metadata,
  });
}

export function createOAuthCredentialSource({
  provider,
  encryption,
  connectionsSlug,
}: {
  provider: OAuthProvider;
  encryption: OAuthEncryption;
  connectionsSlug: string;
}): CredentialSource {
  return {
    key: provider.id,
    services: provider.services ?? [provider.service],
    credentialTypes: ['oauth2'],
    scopes: provider.scopes,
    async refresh({ connection, frogbot, owner }) {
      if (!provider.refresh || !connection.encryptedCredentials) throw new Error('OAuth provider does not support refresh.');
      const req = { frogbot, user: owner } as unknown as FrogbotRequest;
      try {
        const current = deserialize(await encryption.decrypt(connection.encryptedCredentials), connection.expiresAt);
        const next = mergeOAuthTokenSets({ current, next: await provider.refresh({ tokens: current, req }) });
        await frogbot.update({
          collection: connectionsSlug as never,
          id: connection.id,
          data: {
            encryptedCredentials: await encryption.encrypt(serialize(next)),
            expiresAt: next.expiresAt?.toISOString(),
            scopes: next.scopes,
            status: 'active',
          },
          overrideAccess: true,
        });
      } catch (error) {
        await frogbot.update({ collection: connectionsSlug as never, id: connection.id, data: { status: 'error' }, overrideAccess: true });
        throw error;
      }
    },
    async revoke({ connection, frogbot, owner }) {
      if (!provider.revoke || !connection.encryptedCredentials) return;
      const req = { frogbot, user: owner } as unknown as FrogbotRequest;
      const tokens = deserialize(await encryption.decrypt(connection.encryptedCredentials), connection.expiresAt);
      await provider.revoke({ tokens, req }).catch(() => undefined);
    },
  };
}

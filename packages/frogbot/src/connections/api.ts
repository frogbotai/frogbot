import type { TypeWithID } from 'payload';
import type { z } from 'zod';

import type { Frogbot } from '../frogbot.js';
import type { CredentialType, OAuthTokens } from '../pieces/types.js';
import { adaptCredential } from './adapters.js';
import type { SanitizedConnectionsConfig } from './types.js';

export type ConnectionRecord = {
  id: number | string;
  services: string[];
  source: 'oauth' | 'secret';
  sourceKey: string;
  credentialType: Exclude<CredentialType, 'none'>;
  encryptedCredentials?: string;
  status: 'active' | 'error' | 'revoked';
  accountId?: string;
  accountLabel?: string;
  scopes?: string[];
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export type ConnectionInfo = Omit<ConnectionRecord, 'encryptedCredentials'>;
export type AuthorizationRequirement = {
  source: string;
  services: string[];
  type: 'oauth' | 'secret';
  scopes: string[];
  authorizeUrl?: string;
};
export type AppConnectionValue =
  | string
  | { username: string; password: string }
  | ({ type: 'OAUTH2' } & Record<string, unknown>)
  | Record<string, unknown>;

export class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: 'missing' | 'revoked' | 'expired' | 'error' | 'scopes',
    public readonly missingScopes?: string[],
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class Connections {
  private readonly nativeCredentialKeys = new Map<string, { encrypted: string; key: object }>();

  constructor(
    private readonly frogbot: Frogbot,
    private readonly config: SanitizedConnectionsConfig,
  ) {}

  async resolve({
    service,
    owner,
  }: {
    service: string;
    owner?: TypeWithID;
  }): Promise<AppConnectionValue> {
    const source = this.config.sources.find(
      (candidate) => candidate.key === this.config.assignments[service],
    );
    const doc = owner ? await this.findConnection(service, owner) : undefined;
    if (!doc && source?.resolve) return source.resolve({ service, owner });
    if (!doc) throw new ConnectionError(`No connection found for '${service}'.`, 'missing');
    const missingScopes = (source?.scopes ?? []).filter((scope) => !doc.scopes?.includes(scope));
    if (missingScopes.length) {
      throw new ConnectionError(
        `Connection for '${service}' is missing required scopes: ${missingScopes.join(', ')}.`,
        'scopes',
        missingScopes,
      );
    }
    if (doc.status === 'revoked') {
      this.nativeCredentialKeys.delete(String(doc.id));
      throw new ConnectionError(`Connection for '${service}' is revoked.`, 'revoked');
    }
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) {
      const sourceKey = doc.sourceKey;
      const source = this.config.sources.find((candidate) => candidate.key === sourceKey);
      if (!source?.refresh) {
        throw new ConnectionError(`Connection for '${service}' is expired.`, 'expired');
      }
      try {
        await source.refresh({ connection: doc, frogbot: this.frogbot, owner: owner! });
      } catch {
        throw new ConnectionError(`Connection for '${service}' could not be refreshed.`, 'error');
      }
      const refreshed = await this.findConnection(service, owner!);
      if (!refreshed || refreshed.status === 'error') {
        throw new ConnectionError(`Connection for '${service}' could not be refreshed.`, 'error');
      }
      return this.resolveCredentials({ doc: refreshed, service });
    }
    if (doc.status === 'error') {
      this.nativeCredentialKeys.delete(String(doc.id));
      throw new ConnectionError(`Connection for '${service}' is in an error state.`, 'error');
    }
    return this.resolveCredentials({ doc, service });
  }

  async resolvePieceCredential<TAuth>({
    piece,
    owner,
    auth,
    oauthToAuth,
    authSchema,
    factoryKey,
    legacySecretToAuth,
  }: {
    piece: string;
    owner?: TypeWithID | null;
    auth?: TAuth;
    oauthToAuth?: (args: { tokens: OAuthTokens }) => TAuth;
    authSchema?: z.ZodType<TAuth>;
    factoryKey?: object;
    legacySecretToAuth?: (value: string) => TAuth;
  }): Promise<{ auth: TAuth; key: object }> {
    let doc = owner ? await this.findConnection(piece, owner) : undefined;
    if (!doc) {
      if (auth !== undefined) return { auth, key: factoryKey ?? (auth as object) };
      throw new ConnectionError(`No connection found for '${piece}'.`, 'missing');
    }
    if (
      doc.status === 'active' &&
      doc.expiresAt &&
      new Date(doc.expiresAt).getTime() <= Date.now()
    ) {
      const sourceKey = doc.sourceKey;
      const source = this.config.sources.find((candidate) => candidate.key === sourceKey);
      if (!source?.refresh) {
        throw new ConnectionError(`Connection for '${piece}' is expired.`, 'expired');
      }
      try {
        await source.refresh({ connection: doc, frogbot: this.frogbot, owner: owner! });
      } catch {
        throw new ConnectionError(`Connection for '${piece}' could not be refreshed.`, 'error');
      }
      doc = await this.findConnection(piece, owner!);
      if (!doc) {
        throw new ConnectionError(`No connection found for '${piece}'.`, 'missing');
      }
    }
    if (doc.status === 'revoked') {
      throw new ConnectionError(`Connection for '${piece}' is revoked.`, 'revoked');
    }
    if (doc.status === 'error') {
      throw new ConnectionError(`Connection for '${piece}' is in an error state.`, 'error');
    }
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) {
      throw new ConnectionError(`Connection for '${piece}' is expired.`, 'expired');
    }
    if (!doc.encryptedCredentials) {
      throw new ConnectionError(`No connection found for '${piece}'.`, 'missing');
    }
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(
        await this.config.encryption.decrypt(doc.encryptedCredentials),
      ) as Record<string, unknown>;
    } catch {
      throw new ConnectionError(`Connection for '${piece}' has malformed credentials.`, 'error');
    }
    let converted: TAuth;
    try {
      if (doc.source === 'oauth') {
        if (!oauthToAuth) {
          throw new ConnectionError(
            `Connection for '${piece}' cannot be converted to auth.`,
            'error',
          );
        }
        converted = oauthToAuth({ tokens: credentials as OAuthTokens });
      } else if (doc.credentialType === 'secret_text' && legacySecretToAuth) {
        if (typeof credentials.value !== 'string') {
          throw new ConnectionError(
            `Connection for '${piece}' has malformed credentials.`,
            'error',
          );
        }
        converted = legacySecretToAuth(credentials.value);
      } else {
        converted = credentials as TAuth;
      }
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      throw new ConnectionError(`Connection for '${piece}' cannot be converted to auth.`, 'error');
    }
    if (!authSchema) {
      throw new ConnectionError(`Connection for '${piece}' cannot be validated.`, 'error');
    }
    let parsed: ReturnType<typeof authSchema.safeParse>;
    try {
      parsed = authSchema.safeParse(converted);
    } catch {
      throw new ConnectionError(`Connection for '${piece}' has malformed credentials.`, 'error');
    }
    if (!parsed.success) {
      throw new ConnectionError(`Connection for '${piece}' has malformed credentials.`, 'error');
    }
    const identity = this.nativeCredentialKeys.get(String(doc.id));
    if (identity?.encrypted === doc.encryptedCredentials) {
      this.nativeCredentialKeys.delete(String(doc.id));
      this.nativeCredentialKeys.set(String(doc.id), identity);
      return { auth: parsed.data, key: identity.key };
    }
    const key = {};
    this.nativeCredentialKeys.set(String(doc.id), { encrypted: doc.encryptedCredentials, key });
    if (this.nativeCredentialKeys.size > 512) {
      const oldest = this.nativeCredentialKeys.keys().next().value;
      if (oldest !== undefined) this.nativeCredentialKeys.delete(oldest);
    }
    return { auth: parsed.data, key };
  }

  private async resolveCredentials({
    doc,
    service,
  }: {
    doc: ConnectionRecord;
    service: string;
  }): Promise<AppConnectionValue> {
    if (!doc.encryptedCredentials) {
      throw new ConnectionError(`No connection found for '${service}'.`, 'missing');
    }
    const credentials = JSON.parse(
      await this.config.encryption.decrypt(doc.encryptedCredentials),
    ) as Record<string, unknown>;
    return adaptCredential(
      doc.credentialType,
      doc.credentialType === 'custom' ? { ...credentials, ...(doc.metadata ?? {}) } : credentials,
    );
  }

  async list({ owner }: { owner: TypeWithID }): Promise<ConnectionInfo[]> {
    if (!this.config.enabled || !this.config.slug) return [];
    const result = await this.frogbot.find({
      collection: this.config.slug as never,
      where: { owner: { equals: owner.id } },
      overrideAccess: true,
    });
    return (result.docs as unknown as ConnectionRecord[]).map(
      ({ encryptedCredentials: _encryptedCredentials, ...doc }) => doc,
    );
  }

  async authorizations({
    services,
    owner,
  }: {
    services: readonly string[];
    owner: TypeWithID;
  }): Promise<AuthorizationRequirement[]> {
    const grouped = new Map<string, AuthorizationRequirement>();
    for (const service of new Set(services)) {
      const sourceKey = this.config.assignments[service];
      const source = this.config.sources.find((candidate) => candidate.key === sourceKey);
      if (!source || source.policy === 'developer') continue;
      try {
        await this.resolve({ service, owner });
        continue;
      } catch {
        const existing = grouped.get(sourceKey);
        if (existing) {
          existing.services.push(service);
          continue;
        }
        const oauth = source.credentialTypes.includes('oauth2');
        grouped.set(sourceKey, {
          source: sourceKey,
          services: [service],
          type: oauth ? 'oauth' : 'secret',
          scopes: [...(source.scopes ?? [])],
          ...(oauth
            ? { authorizeUrl: `/api/users/oauth/${encodeURIComponent(sourceKey)}/authorize` }
            : {}),
        });
      }
    }
    return [...grouped.values()];
  }

  async revoke({
    service,
    owner,
  }: {
    service: string;
    owner: TypeWithID;
  }): Promise<ConnectionInfo> {
    const doc = await this.findConnection(service, owner);
    if (!doc) throw new ConnectionError(`No connection found for '${service}'.`, 'missing');
    const source = this.config.sources.find((candidate) => candidate.key === doc.sourceKey);
    await source?.revoke?.({ connection: doc, frogbot: this.frogbot, owner });
    const updated = (await this.frogbot.update({
      collection: this.config.slug as never,
      id: doc.id,
      data: { status: 'revoked', encryptedCredentials: '' },
      overrideAccess: true,
    })) as unknown as ConnectionRecord;
    const { encryptedCredentials: _encryptedCredentials, ...info } = updated;
    return info;
  }

  private async findConnection(
    service: string,
    owner: TypeWithID,
  ): Promise<ConnectionRecord | undefined> {
    if (!this.config.enabled || !this.config.slug) return undefined;
    const sourceKey = this.config.assignments[service];
    const result = await this.frogbot.find({
      collection: this.config.slug as never,
      where: {
        and: [
          { owner: { equals: owner.id } },
          ...(sourceKey
            ? [{ sourceKey: { equals: sourceKey } }]
            : [{ services: { contains: service } }]),
        ],
      },
      limit: 1,
      overrideAccess: true,
      showHiddenFields: true,
    });
    return result.docs[0] as unknown as ConnectionRecord | undefined;
  }
}

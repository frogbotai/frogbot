import type { TypeWithID } from 'payload';

import type { Frogbot } from '../frogbot.js';
import type { CredentialType } from '../types/piece.js';
import type { SanitizedConnectionsConfig } from '../types/connections.js';

export type ConnectionRecord = {
  id: number | string;
  service: string;
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
export type AppConnectionValue =
  | string
  | { username: string; password: string }
  | ({ type: 'OAUTH2' } & Record<string, unknown>)
  | Record<string, unknown>;

export class ConnectionError extends Error {
  constructor(message: string, public readonly code: 'missing' | 'revoked' | 'expired' | 'error') {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class Connections {
  constructor(private readonly frogbot: Frogbot, private readonly config: SanitizedConnectionsConfig) {}

  async resolve({ service, owner }: { service: string; owner: TypeWithID }): Promise<AppConnectionValue> {
    const doc = await this.findConnection(service, owner);
    if (!doc) throw new ConnectionError(`No connection found for '${service}'.`, 'missing');
    if (doc.status === 'revoked') throw new ConnectionError(`Connection for '${service}' is revoked.`, 'revoked');
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) {
      const sourceKey = doc.sourceKey;
      const source = this.config.sources.find((candidate) => candidate.key === sourceKey);
      if (!source?.refresh) throw new ConnectionError(`Connection for '${service}' is expired.`, 'expired');
      try {
        await source.refresh({ connection: doc, frogbot: this.frogbot, owner });
      } catch {
        throw new ConnectionError(`Connection for '${service}' could not be refreshed.`, 'error');
      }
      const refreshed = await this.findConnection(service, owner);
      if (!refreshed || refreshed.status === 'error') throw new ConnectionError(`Connection for '${service}' could not be refreshed.`, 'error');
      return this.resolveCredentials(refreshed);
    }
    if (doc.status === 'error') throw new ConnectionError(`Connection for '${service}' is in an error state.`, 'error');
    return this.resolveCredentials(doc);
  }

  private async resolveCredentials(doc: ConnectionRecord): Promise<AppConnectionValue> {
    if (!doc.encryptedCredentials) throw new ConnectionError(`No connection found for '${doc.service}'.`, 'missing');
    const credentials = JSON.parse(await this.config.encryption.decrypt(doc.encryptedCredentials)) as Record<string, unknown>;
    if (doc.credentialType === 'secret_text') return String(credentials.value ?? '');
    if (doc.credentialType === 'basic_auth') return {
      username: String(credentials.username ?? ''),
      password: String(credentials.password ?? ''),
    };
    if (doc.credentialType === 'oauth2') return { type: 'OAUTH2', ...credentials };
    return { ...credentials, ...(doc.metadata ?? {}) };
  }

  async list({ owner }: { owner: TypeWithID }): Promise<ConnectionInfo[]> {
    if (!this.config.enabled || !this.config.slug) return [];
    const result = await this.frogbot.find({
      collection: this.config.slug as never,
      where: { owner: { equals: owner.id } },
      overrideAccess: true,
    });
    return (result.docs as unknown as ConnectionRecord[]).map(({ encryptedCredentials: _encryptedCredentials, ...doc }) => doc);
  }

  async revoke({ service, owner }: { service: string; owner: TypeWithID }): Promise<ConnectionInfo> {
    const doc = await this.findConnection(service, owner);
    if (!doc) throw new ConnectionError(`No connection found for '${service}'.`, 'missing');
    const source = this.config.sources.find((candidate) => candidate.key === doc.sourceKey);
    await source?.revoke?.({ connection: doc, frogbot: this.frogbot, owner });
    const updated = await this.frogbot.update({
      collection: this.config.slug as never,
      id: doc.id,
      data: { status: 'revoked', encryptedCredentials: '' },
      overrideAccess: true,
    }) as unknown as ConnectionRecord;
    const { encryptedCredentials: _encryptedCredentials, ...info } = updated;
    return info;
  }

  private async findConnection(service: string, owner: TypeWithID): Promise<ConnectionRecord | undefined> {
    if (!this.config.enabled || !this.config.slug) return undefined;
    const sourceKey = this.config.assignments[service];
    const result = await this.frogbot.find({
      collection: this.config.slug as never,
      where: {
        and: [
          { owner: { equals: owner.id } },
          { service: { equals: service } },
          ...(sourceKey ? [{ sourceKey: { equals: sourceKey } }] : []),
        ],
      },
      limit: 1,
      overrideAccess: true,
      showHiddenFields: true,
    });
    return result.docs[0] as unknown as ConnectionRecord | undefined;
  }
}

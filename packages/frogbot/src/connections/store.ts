import type { FrogBot } from '../frogbot.js';
import type { PieceJSON, PieceOAuthAccount } from '../pieces/types.js';
import { CredentialCryptoError } from './encryption.js';
import type { SanitizedConnectionsConfig } from './types.js';

export type ConnectionOwner = { id: number | string; collection: string };
export type ConnectionRow = {
  id: number | string;
  owner: number | string;
  piece: string;
  method: 'oauth' | 'secret';
  credential: string;
  account?: PieceOAuthAccount | null;
  scopes: string[];
  expiresAt?: string | null;
  status: 'active' | 'revoked' | 'error';
  createdAt: string;
  updatedAt: string;
};

export type ConnectionMetadata = Omit<ConnectionRow, 'credential'>;
export type ConnectionStoredValue = ConnectionMetadata & { credential: PieceJSON };
export type ConnectionStoreKey = { owner: ConnectionOwner; piece: string };
export type ConnectionStoreWrite = {
  method: ConnectionRow['method'];
  credential: PieceJSON;
  account?: PieceOAuthAccount | null;
  scopes?: string[];
  expiresAt?: string | null;
  status?: ConnectionRow['status'];
};
export type ConnectionStoreLock = {
  signal: AbortSignal;
  get(): Promise<ConnectionStoredValue | undefined>;
  upsert(data: ConnectionStoreWrite): Promise<ConnectionMetadata>;
  delete(args?: { id?: number | string }): Promise<boolean>;
};

function metadata(row: ConnectionRow): ConnectionMetadata {
  return {
    id: row.id,
    owner: row.owner,
    piece: row.piece,
    method: row.method,
    account: row.account,
    scopes: row.scopes ?? [],
    expiresAt: row.expiresAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ConnectionStore {
  private readonly frogbot: Pick<FrogBot, 'find' | 'create' | 'update' | 'delete' | 'kv'>;
  private readonly config: SanitizedConnectionsConfig;
  private readonly userSlug: string;

  constructor({
    frogbot,
    config,
    userSlug,
  }: {
    frogbot: Pick<FrogBot, 'find' | 'create' | 'update' | 'delete' | 'kv'>;
    config: SanitizedConnectionsConfig;
    userSlug: string;
  }) {
    this.frogbot = frogbot;
    this.config = config;
    this.userSlug = userSlug;
  }

  private assertOwner(owner: ConnectionOwner) {
    if (
      !owner ||
      owner.collection !== this.userSlug ||
      !(
        (typeof owner.id === 'string' && owner.id.trim().length > 0) ||
        (typeof owner.id === 'number' && Number.isSafeInteger(owner.id))
      )
    ) {
      throw new Error('Connections require an owner from the admin user collection.');
    }
  }

  private assertKey({ owner, piece }: ConnectionStoreKey) {
    this.assertOwner(owner);
    if (!this.config.enabled || !this.config.slug || !Object.hasOwn(this.config.entries, piece)) {
      throw new Error(`Connection piece '${piece}' is not configured.`);
    }
  }

  async list({ owner }: { owner: ConnectionOwner }): Promise<ConnectionMetadata[]> {
    this.assertOwner(owner);
    if (!this.config.enabled || !this.config.slug) return [];
    const result = await this.frogbot.find({
      collection: this.config.slug as never,
      where: { owner: { equals: owner.id } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    return (result.docs as unknown as ConnectionRow[]).map(metadata);
  }

  private async findRow({ owner, piece }: ConnectionStoreKey): Promise<ConnectionRow | undefined> {
    const result = await this.frogbot.find({
      collection: this.config.slug as never,
      where: { and: [{ owner: { equals: owner.id } }, { piece: { equals: piece } }] },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      showHiddenFields: true,
    });
    return result.docs[0] as unknown as ConnectionRow | undefined;
  }

  async get(key: ConnectionStoreKey): Promise<ConnectionStoredValue | undefined> {
    this.assertKey(key);
    const row = await this.findRow(key);
    if (!row) return;
    try {
      const credential = JSON.parse(await this.config.encryption.decrypt(row.credential));
      return { ...metadata(row), credential };
    } catch {
      throw new CredentialCryptoError();
    }
  }

  upsert({ owner, piece, ...data }: ConnectionStoreKey & ConnectionStoreWrite) {
    return this.withLock({ owner, piece, fn: (locked) => locked.upsert(data) });
  }

  delete({ owner, piece, id }: ConnectionStoreKey & { id?: number | string }) {
    return this.withLock({ owner, piece, fn: (locked) => locked.delete({ id }) });
  }

  async withLock<T>({
    owner,
    piece,
    fn,
  }: ConnectionStoreKey & { fn: (locked: ConnectionStoreLock) => Promise<T> }): Promise<T> {
    this.assertKey({ owner, piece });
    const key = { owner: { ...owner }, piece };
    const lockKey = `connections:${JSON.stringify([this.config.slug, owner.collection, String(owner.id), piece])}`;

    return this.frogbot.kv.lock(lockKey, 30_000, async ({ signal }) => {
      let open = true;
      const check = () => {
        signal.throwIfAborted();
        if (!open) throw new Error('Connection lock is closed.');
      };

      try {
        return await fn({
          signal,
          get: async () => {
            check();
            const value = await this.get(key);
            check();
            return value;
          },
          upsert: async (data) => {
            check();

            if (
              !['oauth', 'secret'].includes(data.method) ||
              !this.config.entries[piece]![data.method]
            ) {
              throw new Error(`Connection method '${data.method}' is not enabled for '${piece}'.`);
            }

            const serialized = JSON.stringify(data.credential);
            if (serialized === undefined) throw new Error('Connection credential must be JSON.');
            const credential = await this.config.encryption.encrypt(serialized);
            check();
            const row = await this.findRow(key);
            check();

            const write = {
              owner: key.owner.id,
              piece,
              method: data.method,
              credential,
              account: data.account ?? null,
              scopes: data.scopes ?? [],
              expiresAt: data.expiresAt ?? null,
              status: data.status ?? 'active',
            };
            const options = {
              collection: this.config.slug as never,
              data: write,
              depth: 0,
              overrideAccess: true,
            };

            const saved = row
              ? await this.frogbot.update({ ...options, id: row.id })
              : await this.frogbot.create(options);
            check();

            return metadata(saved as unknown as ConnectionRow);
          },
          delete: async ({ id } = {}) => {
            check();
            const row = await this.findRow(key);
            check();
            if (!row || (id !== undefined && String(id) !== String(row.id))) return false;

            await this.frogbot.delete({
              collection: this.config.slug as never,
              id: row.id,
              overrideAccess: true,
            });
            check();

            return true;
          },
        });
      } finally {
        open = false;
      }
    });
  }
}

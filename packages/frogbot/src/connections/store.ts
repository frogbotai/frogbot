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

type ConnectionStoreFrogBot = Pick<FrogBot, 'find' | 'create' | 'update' | 'delete' | 'kv'>;

type ConnectionStoreState = {
  config: SanitizedConnectionsConfig;
  frogbot: ConnectionStoreFrogBot;
  userSlug: string;
};

const states = new WeakMap<ConnectionStore, ConnectionStoreState>();

function storeState(store: ConnectionStore): ConnectionStoreState {
  const state = states.get(store);

  if (!state) throw new Error('ConnectionStore is not initialized');

  return state;
}

function assertOwner({ userSlug }: ConnectionStoreState, owner: ConnectionOwner) {
  if (
    !owner ||
    owner.collection !== userSlug ||
    !(
      (typeof owner.id === 'string' && owner.id.trim().length > 0) ||
      (typeof owner.id === 'number' && Number.isSafeInteger(owner.id))
    )
  ) {
    throw new Error('Connections require an owner from the admin user collection.');
  }
}

function assertKey(state: ConnectionStoreState, { owner, piece }: ConnectionStoreKey): string {
  const { config } = state;

  assertOwner(state, owner);

  if (!config.enabled || !config.slug || !Object.hasOwn(config.entries, piece)) {
    throw new Error(`Connection piece '${piece}' is not configured.`);
  }

  return config.slug;
}

async function findRow(
  { frogbot }: ConnectionStoreState,
  slug: string,
  { owner, piece }: ConnectionStoreKey,
): Promise<ConnectionRow | undefined> {
  const result = await frogbot.find({
    collection: slug,
    where: { and: [{ owner: { equals: owner.id } }, { piece: { equals: piece } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true,
  });

  return result.docs[0] as ConnectionRow | undefined;
}

export class ConnectionStore {
  constructor({
    frogbot,
    config,
    userSlug,
  }: {
    frogbot: ConnectionStoreFrogBot;
    config: SanitizedConnectionsConfig;
    userSlug: string;
  }) {
    states.set(this, { config, frogbot, userSlug });
  }

  async list({ owner }: { owner: ConnectionOwner }): Promise<ConnectionMetadata[]> {
    const state = storeState(this);
    const { config, frogbot } = state;

    assertOwner(state, owner);

    if (!config.enabled || !config.slug) return [];

    const result = await frogbot.find({
      collection: config.slug,
      where: { owner: { equals: owner.id } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });

    return (result.docs as ConnectionRow[]).map(metadata);
  }

  async get(key: ConnectionStoreKey): Promise<ConnectionStoredValue | undefined> {
    const state = storeState(this);

    const slug = assertKey(state, key);

    const row = await findRow(state, slug, key);

    if (!row) return;

    try {
      const credential = JSON.parse(await state.config.encryption.decrypt(row.credential));

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
    const state = storeState(this);
    const { config, frogbot } = state;

    const slug = assertKey(state, { owner, piece });

    const key = { owner: { ...owner }, piece };
    const lockKey = `connections:${JSON.stringify([slug, owner.collection, String(owner.id), piece])}`;

    return frogbot.kv.lock(lockKey, 30_000, async ({ signal }) => {
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

            if (!['oauth', 'secret'].includes(data.method) || !config.entries[piece][data.method]) {
              throw new Error(`Connection method '${data.method}' is not enabled for '${piece}'.`);
            }

            const serialized = JSON.stringify(data.credential);
            if (serialized === undefined) throw new Error('Connection credential must be JSON.');
            const credential = await config.encryption.encrypt(serialized);
            check();
            const row = await findRow(state, slug, key);
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
              collection: slug,
              data: write,
              depth: 0,
              overrideAccess: true,
            };

            const saved = row
              ? await frogbot.update({ ...options, id: row.id })
              : await frogbot.create(options);

            check();

            return metadata(saved as ConnectionRow);
          },
          delete: async ({ id } = {}) => {
            check();
            const row = await findRow(state, slug, key);
            check();
            if (!row || (id !== undefined && String(id) !== String(row.id))) return false;

            await frogbot.delete({
              collection: slug,
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

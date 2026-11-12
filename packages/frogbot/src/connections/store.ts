import type { FrogBot } from '../frogbot.js';
import type { PieceJSON, PieceOAuthAccount } from '../pieces/types.js';
import { CredentialCryptoError } from './encryption.js';
import type {
  ConnectionHolder,
  SanitizedConnectionEntry,
  SanitizedConnectionsConfig,
} from './types.js';

export type ConnectionOwner = { id: number | string; collection: string };

export type ConnectionRow = {
  id: number | string;
  /** The user who linked the account; empty on an app slot's row. */
  owner?: number | string | null;
  /** The slot's name on an app slot's row; empty on a user's row. */
  app?: string | null;
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

export type ConnectionStoreKey = ConnectionHolder & { piece: string };

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

/** The configured entry for `piece`, for a user or for the app slot `app`. */
export function connectionEntry(
  config: SanitizedConnectionsConfig,
  { app, piece }: { app?: string; piece: string },
): SanitizedConnectionEntry | undefined {
  const entries =
    app === undefined
      ? config.entries
      : Object.hasOwn(config.apps, app)
        ? config.apps[app]
        : undefined;

  return entries && Object.hasOwn(entries, piece) ? entries[piece] : undefined;
}

function metadata(row: ConnectionRow): ConnectionMetadata {
  return {
    id: row.id,
    owner: row.owner ?? null,
    app: row.app || null,
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

function holderKey(key: ConnectionStoreKey): ConnectionStoreKey {
  return key.app === undefined
    ? { owner: { ...key.owner }, piece: key.piece }
    : { app: key.app, piece: key.piece };
}

/**
 * The holder's part of a lock or cache key. A user's and a slot's parts differ in their first
 * element, so no user collection name can collide with a slot name.
 */
export function connectionHolderKey(holder: ConnectionHolder): string[] {
  return holder.app === undefined
    ? ['user', holder.owner.collection, String(holder.owner.id)]
    : ['app', holder.app];
}

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

function assertKey(
  state: ConnectionStoreState,
  key: ConnectionStoreKey,
): { slug: string; entry: SanitizedConnectionEntry } {
  const { config } = state;

  if (key.app === undefined) assertOwner(state, key.owner);
  else if (typeof key.app !== 'string' || !key.app) {
    throw new Error('Connection app slot names must be non-empty strings.');
  }

  const entry = connectionEntry(config, key);

  if (!config.enabled || !config.slug || !entry) {
    throw new Error(
      key.app === undefined
        ? `Connection piece '${key.piece}' is not configured.`
        : `Connection piece '${key.piece}' is not configured for app '${key.app}'.`,
    );
  }

  return { slug: config.slug, entry };
}

async function findRow(
  { frogbot }: ConnectionStoreState,
  slug: string,
  key: ConnectionStoreKey,
): Promise<ConnectionRow | undefined> {
  const result = await frogbot.find({
    collection: slug,
    where: {
      and: [
        key.app === undefined ? { owner: { equals: key.owner.id } } : { app: { equals: key.app } },
        { piece: { equals: key.piece } },
      ],
    },
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

  /** Every configured app slot's row, without credentials. */
  async slots(): Promise<ConnectionMetadata[]> {
    const { config, frogbot } = storeState(this);
    const apps = Object.keys(config.apps);

    if (!config.enabled || !config.slug || !apps.length) return [];

    const result = await frogbot.find({
      collection: config.slug,
      where: { app: { in: apps } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });

    return (result.docs as ConnectionRow[])
      .filter((row) => row.app && connectionEntry(config, { app: row.app, piece: row.piece }))
      .map(metadata);
  }

  async get(key: ConnectionStoreKey): Promise<ConnectionStoredValue | undefined> {
    const state = storeState(this);

    const { slug } = assertKey(state, key);

    const row = await findRow(state, slug, key);

    if (!row) return;

    try {
      const credential = JSON.parse(await state.config.encryption.decrypt(row.credential));

      return { ...metadata(row), credential };
    } catch {
      throw new CredentialCryptoError();
    }
  }

  upsert({
    method,
    credential,
    account,
    scopes,
    expiresAt,
    status,
    ...key
  }: ConnectionStoreKey & ConnectionStoreWrite): Promise<ConnectionMetadata> {
    return this.withLock({
      ...holderKey(key),
      fn: (locked) => locked.upsert({ method, credential, account, scopes, expiresAt, status }),
    });
  }

  delete({ id, ...key }: ConnectionStoreKey & { id?: number | string }): Promise<boolean> {
    return this.withLock({ ...holderKey(key), fn: (locked) => locked.delete({ id }) });
  }

  async withLock<T>({
    fn,
    ...input
  }: ConnectionStoreKey & { fn: (locked: ConnectionStoreLock) => Promise<T> }): Promise<T> {
    const state = storeState(this);
    const { frogbot } = state;

    const key = holderKey(input);
    const { slug, entry } = assertKey(state, key);
    const lockKey = `connections:${JSON.stringify([slug, ...connectionHolderKey(key), key.piece])}`;

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

            if (!['oauth', 'secret'].includes(data.method) || !entry[data.method]) {
              throw new Error(
                `Connection method '${data.method}' is not enabled for '${key.piece}'.`,
              );
            }

            const serialized = JSON.stringify(data.credential);
            if (serialized === undefined) throw new Error('Connection credential must be JSON.');
            const credential = await state.config.encryption.encrypt(serialized);
            check();
            const row = await findRow(state, slug, key);
            check();

            const write = {
              owner: key.app === undefined ? key.owner.id : null,
              app: key.app ?? '',
              piece: key.piece,
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

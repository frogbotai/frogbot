import type { FrogBot } from '../frogbot.js';
import type { PieceJSON, PieceOAuthAccount } from '../pieces/types.js';
import { CredentialCryptoError } from './encryption.js';
import { OAuthError } from './oauth/error.js';
import type { SanitizedConnectionsConfig } from './types.js';

export type ConnectionOwner = { id: number | string; collection: string };

export type ConnectionRow = {
  id: number | string;
  owner: number | string;
  piece: string;
  method: 'oauth' | 'secret';
  credential: string;
  account?: PieceOAuthAccount | null;
  /** The provider account id, or `''` for a link with no account (an API key). */
  accountId: string;
  /** Whether calls that pin no account use this row. Exactly one row per owner and piece. */
  isDefault: boolean;
  scopes: string[];
  expiresAt?: string | null;
  status: 'active' | 'revoked' | 'error';
  createdAt: string;
  updatedAt: string;
};

export type ConnectionMetadata = Omit<ConnectionRow, 'credential'>;

export type ConnectionStoredValue = ConnectionMetadata & { credential: PieceJSON };

export type ConnectionStoreKey = { owner: ConnectionOwner; piece: string };

export type ConnectionID = number | string;

export type ConnectionStoreWrite = {
  method: ConnectionRow['method'];
  credential: PieceJSON;
  account?: PieceOAuthAccount | null;
  scopes?: string[];
  expiresAt?: string | null;
  status?: ConnectionRow['status'];
  /**
   * Saves onto this row only. The write must carry the row's provider account, or it throws
   * `OAuthError('account')` and writes nothing.
   */
  reconnect?: ConnectionID;
};

/**
 * Row operations for one owner and piece, run while their lock is held. Every write leaves
 * exactly one default row when any row remains.
 */
export type ConnectionStoreLock = {
  signal: AbortSignal;
  /** The owner's rows for the piece, oldest first. */
  rows(): Promise<ConnectionMetadata[]>;
  /** The row with `id`, or with no `id` the only row or else the default row. */
  get(id?: ConnectionID): Promise<ConnectionStoredValue | undefined>;
  upsert(data: ConnectionStoreWrite): Promise<ConnectionMetadata>;
  /** Deletes the row with `id` (with no `id`, the default row) and promotes the oldest left. */
  delete(id?: ConnectionID): Promise<boolean>;
  setDefault(id: ConnectionID): Promise<ConnectionMetadata | undefined>;
};

function metadata(row: ConnectionRow): ConnectionMetadata {
  return {
    id: row.id,
    owner: row.owner,
    piece: row.piece,
    method: row.method,
    account: row.account,
    accountId: accountKey(row),
    isDefault: row.isDefault === true,
    scopes: row.scopes ?? [],
    expiresAt: row.expiresAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const sameID = (a: ConnectionID, b: ConnectionID) => String(a) === String(b);

const accountKey = (row: Pick<ConnectionRow, 'accountId' | 'account'>) =>
  row.accountId || row.account?.id || '';

function byAge(a: ConnectionRow, b: ConnectionRow): number {
  const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (time) return time;
  const [x, y] = [String(a.id), String(b.id)];

  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
}

/** The row unpinned calls use: the only row, else the default row. */
export function defaultRow<T extends Pick<ConnectionRow, 'isDefault'>>(rows: T[]): T | undefined {
  return rows.length === 1 ? rows[0] : rows.find((row) => row.isDefault);
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

async function findRows(
  { frogbot }: ConnectionStoreState,
  slug: string,
  { owner, piece }: ConnectionStoreKey,
): Promise<ConnectionRow[]> {
  const result = await frogbot.find({
    collection: slug,
    where: { and: [{ owner: { equals: owner.id } }, { piece: { equals: piece } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    showHiddenFields: true,
  });

  return (result.docs as ConnectionRow[]).sort(byAge);
}

async function decrypt(
  { config }: ConnectionStoreState,
  row: ConnectionRow | undefined,
): Promise<ConnectionStoredValue | undefined> {
  if (!row) return;

  try {
    const credential = JSON.parse(await config.encryption.decrypt(row.credential));

    return { ...metadata(row), credential };
  } catch {
    throw new CredentialCryptoError();
  }
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

    return (result.docs as ConnectionRow[]).sort(byAge).map(metadata);
  }

  async rows(key: ConnectionStoreKey): Promise<ConnectionMetadata[]> {
    const state = storeState(this);
    const slug = assertKey(state, key);

    return (await findRows(state, slug, key)).map(metadata);
  }

  /** The row with `id`, or with no `id` the only row or else the default row. */
  async get({
    id,
    ...key
  }: ConnectionStoreKey & { id?: ConnectionID }): Promise<ConnectionStoredValue | undefined> {
    const state = storeState(this);
    const slug = assertKey(state, key);
    const rows = await findRows(state, slug, key);

    return decrypt(
      state,
      id === undefined ? defaultRow(rows) : rows.find((row) => sameID(row.id, id)),
    );
  }

  upsert({ owner, piece, ...data }: ConnectionStoreKey & ConnectionStoreWrite) {
    return this.withLock({ owner, piece, fn: (locked) => locked.upsert(data) });
  }

  delete({ owner, piece, id }: ConnectionStoreKey & { id?: ConnectionID }) {
    return this.withLock({ owner, piece, fn: (locked) => locked.delete(id) });
  }

  setDefault({ owner, piece, id }: ConnectionStoreKey & { id: ConnectionID }) {
    return this.withLock({ owner, piece, fn: (locked) => locked.setDefault(id) });
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

      const rows = async () => {
        check();
        const found = await findRows(state, slug, key);
        check();

        return found;
      };

      const settle = async (keep?: ConnectionID): Promise<ConnectionRow[]> => {
        const current = await rows();
        const target =
          (keep !== undefined && current.find((row) => sameID(row.id, keep))) ||
          current.find((row) => row.isDefault) ||
          current[0];

        const changes = current
          .filter((row) => row.isDefault !== (row === target))
          .sort((a, b) => Number(b === target) - Number(a === target));

        for (const row of changes) {
          await frogbot.update({
            collection: slug,
            id: row.id,
            data: { isDefault: row === target },
            depth: 0,
            overrideAccess: true,
          });

          check();
        }

        return current.map((row) => ({ ...row, isDefault: row === target }));
      };

      try {
        return await fn({
          signal,
          rows: async () => (await rows()).map(metadata),
          get: async (id) => {
            const found = await rows();
            const value = await decrypt(
              state,
              id === undefined ? defaultRow(found) : found.find((row) => sameID(row.id, id)),
            );

            check();

            return value;
          },
          upsert: async ({ reconnect, ...data }) => {
            check();

            if (!['oauth', 'secret'].includes(data.method) || !config.entries[piece][data.method]) {
              throw new Error(`Connection method '${data.method}' is not enabled for '${piece}'.`);
            }

            const serialized = JSON.stringify(data.credential);
            if (serialized === undefined) throw new Error('Connection credential must be JSON.');
            const credential = await config.encryption.encrypt(serialized);
            const accountId = data.account?.id ?? '';
            const current = await rows();
            const row =
              reconnect === undefined
                ? current.find((row) => accountKey(row) === accountId)
                : current.find((row) => sameID(row.id, reconnect));

            if (reconnect !== undefined && (!row || accountKey(row) !== accountId)) {
              throw new OAuthError('account');
            }

            const isDefault = row?.isDefault === true || !current.some((row) => row.isDefault);
            const write = {
              owner: key.owner.id,
              piece,
              method: data.method,
              credential,
              account: data.account ?? null,
              accountId,
              isDefault,
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

            const saved = (
              row ? await frogbot.update({ ...options, id: row.id }) : await frogbot.create(options)
            ) as ConnectionRow;

            check();
            const settled = await settle(isDefault ? saved.id : undefined);

            return metadata(settled.find((row) => sameID(row.id, saved.id)) ?? saved);
          },
          delete: async (id) => {
            const current = await rows();
            const row =
              id === undefined ? defaultRow(current) : current.find((row) => sameID(row.id, id));

            if (!row) return false;

            await frogbot.delete({
              collection: slug,
              id: row.id,
              overrideAccess: true,
            });

            check();
            await settle();

            return true;
          },
          setDefault: async (id) => {
            const current = await rows();
            if (!current.some((row) => sameID(row.id, id))) return;
            const settled = await settle(id);
            const row = settled.find((row) => sameID(row.id, id));

            return row && metadata(row);
          },
        });
      } finally {
        open = false;
      }
    });
  }
}

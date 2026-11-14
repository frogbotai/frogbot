import { createHmac, randomBytes } from 'node:crypto';

import { getPayloadConfig } from '../config/getPayloadConfig.js';
import type { FrogBot } from '../frogbot.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { PieceInstance, PieceJSON } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { refreshOAuthConnection } from './oauth/refresh.js';
import { revokeOAuthConnection } from './oauth/revoke.js';
import { oauthScopes } from './oauth/scopes.js';
import { oauthAuth, parseOAuthTokens } from './oauth/tokens.js';
import {
  connectionEntry,
  connectionHolderKey,
  type ConnectionID,
  type ConnectionMetadata,
  type ConnectionOwner,
  ConnectionStore,
  defaultRow,
} from './store.js';
import type { ConnectionHolder, SanitizedConnectionsConfig } from './types.js';

export type AuthorizationRequirement = {
  piece: string;
  oauth: boolean;
  secret: boolean;
  scopes: string[];
  authorizeUrl?: string;
};

export type ConnectionResolveArgs = {
  piece: PieceInstance;
  req: FrogBotRequest;
  scopes?: readonly string[];
  /** Pins one of the holder's linked accounts by row id; omitted, the default account is used. */
  connection?: ConnectionID;
  /**
   * The app slot to read, by its `app` name in `connections`. The request's user is not used, and
   * an unlinked slot throws `ConnectionError('missing')`.
   */
  as?: string;
};

export class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly code:
      'missing' | 'revoked' | 'expired' | 'error' | 'scopes' | 'ambiguous' | 'forbidden',
    public readonly missingScopes?: string[],
    public readonly piece?: string,
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

function canonicalJSON(value: PieceJSON): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

type ConnectionsState = {
  config: SanitizedConnectionsConfig;
  credentialKeys: Map<string, { fingerprint: string; key: object }>;
  frogbot: FrogBot;
  identitySecret: Buffer;
  storePromise?: Promise<ConnectionStore>;
};

const states = new WeakMap<Connections, ConnectionsState>();

export function connectionsState(connections: Connections): ConnectionsState {
  const state = states.get(connections);

  if (!state) throw new Error('Connections is not initialized');

  return state;
}

const rowKey = (holder: ConnectionHolder, id: ConnectionID) =>
  JSON.stringify([...connectionHolderKey(holder), String(id)]);

async function requestOwner(
  frogbot: FrogBot,
  req: FrogBotRequest,
): Promise<ConnectionOwner | undefined> {
  const { admin } = await getPayloadConfig(frogbot.config);
  const user = req.user;

  if (
    user?.collection === admin.user &&
    ((typeof user.id === 'string' && user.id.trim().length > 0) ||
      (typeof user.id === 'number' && Number.isSafeInteger(user.id)))
  ) {
    return { id: user.id, collection: user.collection };
  }

  return undefined;
}

export class Connections {
  constructor(frogbot: FrogBot, config: SanitizedConnectionsConfig) {
    states.set(this, {
      config,
      credentialKeys: new Map(),
      frogbot,
      identitySecret: randomBytes(32),
    });
  }

  get store(): Promise<ConnectionStore> {
    const state = connectionsState(this);

    return (state.storePromise ??= getPayloadConfig(state.frogbot.config).then(
      ({ admin }) =>
        new ConnectionStore({ frogbot: state.frogbot, config: state.config, userSlug: admin.user }),
    ));
  }

  async resolve(args: ConnectionResolveArgs): Promise<unknown> {
    return (await this.resolvePieceCredential(args)).auth;
  }

  async resolvePieceCredential({
    piece,
    req,
    scopes,
    connection,
    as,
  }: ConnectionResolveArgs): Promise<{ auth: unknown; key: object }> {
    const { config, credentialKeys, frogbot, identitySecret } = connectionsState(this);
    const runtime = pieceInstanceRuntime(piece);
    const slug = piece.piece;
    if (
      as !== undefined &&
      (typeof as !== 'string' || !connectionEntry(config, { app: as, piece: slug }))
    ) {
      throw new Error(
        `[frogbot] No connection entry declares piece '${slug}' with app '${String(as)}'.`,
      );
    }

    if (!runtime.definition.auth) return { auth: undefined, key: piece };

    let holder: ConnectionHolder | undefined;
    if (as !== undefined) holder = { app: as };
    else {
      const owner = await requestOwner(frogbot, req);
      holder = owner && { owner };
    }

    let id: string | undefined;
    const fail = (code: ConnectionError['code'], message: string): never => {
      if (id) credentialKeys.delete(id);
      throw new ConnectionError(`Connection for '${slug}' ${message}.`, code, undefined, slug);
    };

    const configured = connectionEntry(config, { app: as, piece: slug });
    const entry =
      configured &&
      (as !== undefined || configured.piece.slug === piece.slug || runtime.auth === undefined)
        ? configured
        : undefined;

    if (!entry && connection === undefined) {
      if (runtime.auth !== undefined) return { auth: runtime.auth, key: piece };

      return fail('missing', 'is not linked');
    }

    const notLinked = `${as === undefined ? 'is not linked' : `app '${as}' is not linked`}. Link it in Settings → Linked accounts`;
    let row;
    try {
      const store = await this.store;
      const rows = holder && entry ? await store.rows({ ...holder, piece: slug }) : [];
      const picked =
        connection === undefined
          ? defaultRow(rows)
          : rows.find((row) => String(row.id) === String(connection));

      if (connection !== undefined && !picked) {
        throw new ConnectionError(
          `Connection ${JSON.stringify(String(connection))} is not one of your '${slug}' accounts.`,
          'forbidden',
          undefined,
          slug,
        );
      }

      if (!picked && rows.length) {
        throw new ConnectionError(
          `Connection for '${slug}' has several accounts and no default. Choose a default account in Settings → Linked accounts.`,
          'ambiguous',
          undefined,
          slug,
        );
      }

      if (picked) id = rowKey(holder!, picked.id);
      row = picked && (await store.get({ ...holder!, piece: slug, id: picked.id }));
    } catch (error) {
      if (error instanceof ConnectionError) throw error;

      return fail('error', 'could not be read');
    }

    if (!row || !entry) return fail('missing', notLinked);

    if (
      row.status === 'active' &&
      row.method === 'oauth' &&
      entry.oauth &&
      row.expiresAt &&
      Date.parse(row.expiresAt) <= Date.now()
    ) {
      try {
        row = await refreshOAuthConnection({
          store: await this.store,
          holder: holder!,
          piece: entry.piece,
          id: row.id,
          req,
        });
      } catch {
        return fail('error', 'could not be refreshed');
      }

      if (!row) return fail('missing', notLinked);
    }

    if (row.status === 'revoked') return fail('revoked', 'is revoked');
    if (row.status !== 'active') return fail('error', 'is in an error state');
    if (row.expiresAt) {
      const expiresAt = Date.parse(row.expiresAt);
      if (!Number.isFinite(expiresAt)) return fail('error', 'has an invalid expiry');
      if (expiresAt <= Date.now()) return fail('expired', 'is expired');
    }

    if ((row.method !== 'secret' && row.method !== 'oauth') || !entry[row.method]) {
      return fail('error', 'uses an unavailable method');
    }

    const requiredScopes = scopes ?? (row.method === 'oauth' ? oauthScopes(entry.piece) : []);

    const missingScopes = [...new Set(requiredScopes)].filter(
      (scope) => !row.scopes.includes(scope),
    );

    if (missingScopes.length) {
      throw new ConnectionError(
        `Connection for '${slug}' is missing required scopes.`,
        'scopes',
        missingScopes,
        slug,
      );
    }

    let auth: unknown;
    try {
      auth =
        row.method === 'oauth'
          ? oauthAuth({ piece, tokens: parseOAuthTokens(row.credential) })
          : runtime.definition.auth.parse(row.credential);
    } catch {
      return fail('error', 'has invalid credentials');
    }

    const fingerprint = createHmac('sha256', identitySecret)
      .update(row.method)
      .update(canonicalJSON(row.credential))
      .digest('hex');

    let identity = credentialKeys.get(id!);
    if (!identity || identity.fingerprint !== fingerprint) identity = { fingerprint, key: {} };

    credentialKeys.delete(id!);
    credentialKeys.set(id!, identity);
    if (credentialKeys.size > 512) {
      credentialKeys.delete(credentialKeys.keys().next().value!);
    }

    return { auth, key: identity.key };
  }

  async list({ req }: { req: FrogBotRequest }) {
    const { credentialKeys, frogbot } = connectionsState(this);
    const owner = await requestOwner(frogbot, req);
    if (!owner) throw new Error('Connections require an owner from the admin user collection.');
    const rows = await (await this.store).list({ owner });
    const prefix = `${JSON.stringify(connectionHolderKey({ owner })).slice(0, -1)},`;
    const current = new Set(rows.map((row) => rowKey({ owner }, row.id)));

    for (const id of credentialKeys.keys()) {
      if (id.startsWith(prefix) && !current.has(id)) credentialKeys.delete(id);
    }

    return rows;
  }

  /**
   * Every linked app slot, without credentials. Only users of the admin collection may read them.
   */
  async slots({ req }: { req: FrogBotRequest }): Promise<ConnectionMetadata[]> {
    const { frogbot } = connectionsState(this);
    if (!(await requestOwner(frogbot, req))) {
      throw new Error('Connections require an owner from the admin user collection.');
    }

    return (await this.store).slots();
  }

  /**
   * Disconnects the app slot `app` for `piece`: ends an OAuth session at the provider when the
   * recipe can, then deletes the row. Only users of the admin collection may do this.
   */
  async deleteSlot({
    req,
    app,
    piece,
  }: {
    req: FrogBotRequest;
    app: string;
    piece: string;
  }): Promise<boolean> {
    const { config, credentialKeys, frogbot } = connectionsState(this);
    if (!(await requestOwner(frogbot, req))) {
      throw new Error('Connections require an owner from the admin user collection.');
    }

    const entry = connectionEntry(config, { app, piece });
    if (!entry) return false;
    const store = await this.store;
    const holder = { app };
    const row = defaultRow(await store.rows({ ...holder, piece }));
    if (!row) return false;
    if (entry.oauth) {
      await revokeOAuthConnection({ store, holder, piece: entry.piece, id: row.id, req });
    }

    const deleted = await store.delete({ ...holder, piece, id: row.id });
    credentialKeys.delete(rowKey(holder, row.id));

    return deleted;
  }

  async delete({ req, id }: { req: FrogBotRequest; id: ConnectionID }): Promise<boolean> {
    const { config, credentialKeys, frogbot } = connectionsState(this);
    const owner = await requestOwner(frogbot, req);
    if (!owner) throw new Error('Connections require an owner from the admin user collection.');
    const store = await this.store;
    const row = (await this.list({ req })).find((row) => String(row.id) === String(id));
    if (!row) return false;

    if (row.method === 'oauth') {
      const entry = Object.hasOwn(config.entries, row.piece)
        ? config.entries[row.piece]
        : undefined;

      if (entry) {
        await revokeOAuthConnection({
          store,
          holder: { owner },
          piece: entry.piece,
          id: row.id,
          req,
        });
      }
    }

    const deleted = await store.delete({ owner, piece: row.piece, id: row.id });
    if (deleted) credentialKeys.delete(rowKey({ owner }, row.id));

    return deleted;
  }

  /** Makes the caller's row `id` the default account of its piece; `undefined` if it isn't theirs. */
  async setDefault({ req, id }: { req: FrogBotRequest; id: ConnectionID }) {
    const { frogbot } = connectionsState(this);
    const owner = await requestOwner(frogbot, req);
    if (!owner) throw new Error('Connections require an owner from the admin user collection.');
    const store = await this.store;
    const row = (await store.list({ owner })).find((row) => String(row.id) === String(id));
    if (!row || !Object.hasOwn(connectionsState(this).config.entries, row.piece)) return;

    return store.setDefault({ owner, piece: row.piece, id: row.id });
  }

  async authorizations({
    pieces,
    req,
  }: {
    pieces: readonly PieceInstance[];
    req: FrogBotRequest;
  }): Promise<AuthorizationRequirement[]> {
    const { config, frogbot } = connectionsState(this);
    const requirements = new Map<string, AuthorizationRequirement>();
    const { routes } = await getPayloadConfig(frogbot.config);

    for (const piece of new Set(pieces)) {
      const entry = Object.hasOwn(config.entries, piece.piece)
        ? config.entries[piece.piece]
        : undefined;

      if (!entry) continue;
      try {
        await this.resolve({ piece, req });
      } catch (error) {
        if (
          !(error instanceof ConnectionError) ||
          error.code === 'ambiguous' ||
          error.code === 'forbidden'
        ) {
          throw error;
        }

        requirements.set(piece.piece, {
          piece: piece.piece,
          oauth: entry.oauth,
          secret: entry.secret,
          scopes: entry.oauth ? oauthScopes(entry.piece) : [],
          ...(entry.oauth
            ? {
                authorizeUrl: `${routes.api}/connections/${encodeURIComponent(piece.piece)}/authorize`,
              }
            : {}),
        });
      }
    }

    return [...requirements.values()];
  }
}

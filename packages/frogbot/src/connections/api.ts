import { createHmac, randomBytes } from 'node:crypto';

import { getPayloadConfig } from '../config/getPayloadConfig.js';
import type { FrogBot } from '../frogbot.js';
import { pieceInstanceRuntime } from '../pieces/definePiece.js';
import type { PieceInstance, PieceJSON } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { refreshOAuthConnection } from './oauth/refresh.js';
import { oauthAuth, parseOAuthTokens } from './oauth/tokens.js';
import { type ConnectionOwner, ConnectionStore } from './store.js';
import type { SanitizedConnectionsConfig } from './types.js';

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
};

export class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: 'missing' | 'revoked' | 'expired' | 'error' | 'scopes',
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
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key]!)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export class Connections {
  private storePromise?: Promise<ConnectionStore>;
  private readonly identitySecret = randomBytes(32);
  private readonly credentialKeys = new Map<
    string,
    { rowID: string; fingerprint: string; key: object }
  >();

  constructor(
    private readonly frogbot: FrogBot,
    private readonly config: SanitizedConnectionsConfig,
  ) {}

  get store(): Promise<ConnectionStore> {
    return (this.storePromise ??= getPayloadConfig(this.frogbot.config).then(
      ({ admin }) =>
        new ConnectionStore({ frogbot: this.frogbot, config: this.config, userSlug: admin.user }),
    ));
  }

  private async owner(req: FrogBotRequest): Promise<ConnectionOwner | undefined> {
    const { admin } = await getPayloadConfig(this.frogbot.config);
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

  async resolve(args: ConnectionResolveArgs): Promise<unknown> {
    return (await this.resolvePieceCredential(args)).auth;
  }

  async resolvePieceCredential({
    piece,
    req,
    scopes,
  }: ConnectionResolveArgs): Promise<{ auth: unknown; key: object }> {
    const runtime = pieceInstanceRuntime(piece);
    const slug = piece.piece;
    if (!runtime.definition.auth) return { auth: undefined, key: piece };

    const owner = await this.owner(req);
    const id = owner ? JSON.stringify([owner.collection, String(owner.id), slug]) : undefined;
    const fail = (code: ConnectionError['code'], message: string): never => {
      if (id) this.credentialKeys.delete(id);
      throw new ConnectionError(`Connection for '${slug}' ${message}.`, code, undefined, slug);
    };

    const entry = Object.hasOwn(this.config.entries, slug) ? this.config.entries[slug] : undefined;
    let row;
    try {
      row = owner && entry ? await (await this.store).get({ owner, piece: slug }) : undefined;
    } catch {
      return fail('error', 'could not be read');
    }

    if (!row) {
      if (id) this.credentialKeys.delete(id);
      if (runtime.auth !== undefined) return { auth: runtime.auth, key: piece };
      return fail('missing', 'is not linked');
    }

    if (
      row.status === 'active' &&
      row.method === 'oauth' &&
      entry?.oauth &&
      row.expiresAt &&
      Date.parse(row.expiresAt) <= Date.now()
    ) {
      try {
        row = await refreshOAuthConnection({
          store: await this.store,
          owner: owner!,
          piece: entry.piece,
          req,
        });
      } catch {
        return fail('error', 'could not be refreshed');
      }
      if (!row) return fail('missing', 'is not linked');
    }

    if (row.status === 'revoked') return fail('revoked', 'is revoked');
    if (row.status !== 'active') return fail('error', 'is in an error state');
    if (row.expiresAt) {
      const expiresAt = Date.parse(row.expiresAt);
      if (!Number.isFinite(expiresAt)) return fail('error', 'has an invalid expiry');
      if (expiresAt <= Date.now()) return fail('expired', 'is expired');
    }

    if ((row.method !== 'secret' && row.method !== 'oauth') || !entry?.[row.method]) {
      return fail('error', 'uses an unavailable method');
    }
    const requiredScopes =
      scopes ??
      (row.method === 'oauth'
        ? (piece.oauth?.scopes ?? runtime.definition.oauth?.scopes ?? [])
        : []);
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

    const fingerprint = createHmac('sha256', this.identitySecret)
      .update(row.method)
      .update(canonicalJSON(row.credential))
      .digest('hex');
    let identity = this.credentialKeys.get(id!);
    if (!identity || identity.rowID !== String(row.id) || identity.fingerprint !== fingerprint) {
      identity = { rowID: String(row.id), fingerprint, key: {} };
    }

    this.credentialKeys.delete(id!);
    this.credentialKeys.set(id!, identity);
    if (this.credentialKeys.size > 512) {
      this.credentialKeys.delete(this.credentialKeys.keys().next().value!);
    }

    return { auth, key: identity.key };
  }

  async list({ req }: { req: FrogBotRequest }) {
    const owner = await this.owner(req);
    if (!owner) throw new Error('Connections require an owner from the admin user collection.');
    const rows = await (await this.store).list({ owner });
    const prefix = `${JSON.stringify([owner.collection, String(owner.id)]).slice(0, -1)},`;
    const current = new Map(
      rows.map((row) => [
        JSON.stringify([owner.collection, String(owner.id), row.piece]),
        String(row.id),
      ]),
    );
    for (const [id, identity] of this.credentialKeys) {
      if (id.startsWith(prefix) && current.get(id) !== identity.rowID) {
        this.credentialKeys.delete(id);
      }
    }
    return rows;
  }

  async delete({ req, id }: { req: FrogBotRequest; id: number | string }): Promise<boolean> {
    const owner = await this.owner(req);
    if (!owner) throw new Error('Connections require an owner from the admin user collection.');
    const store = await this.store;
    const row = (await this.list({ req })).find((row) => String(row.id) === String(id));
    if (!row) return false;
    const deleted = await store.delete({ owner, piece: row.piece, id });
    if (deleted) {
      this.credentialKeys.delete(JSON.stringify([owner.collection, String(owner.id), row.piece]));
    }
    return deleted;
  }

  async authorizations({
    pieces,
    req,
  }: {
    pieces: readonly PieceInstance[];
    req: FrogBotRequest;
  }): Promise<AuthorizationRequirement[]> {
    const requirements = new Map<string, AuthorizationRequirement>();
    const { routes } = await getPayloadConfig(this.frogbot.config);
    for (const piece of new Set(pieces)) {
      const entry = Object.hasOwn(this.config.entries, piece.piece)
        ? this.config.entries[piece.piece]
        : undefined;
      if (!entry) continue;
      try {
        await this.resolve({ piece, req });
      } catch (error) {
        if (!(error instanceof ConnectionError)) throw error;
        const recipe = pieceInstanceRuntime(entry.piece).definition.oauth;
        requirements.set(piece.piece, {
          piece: piece.piece,
          oauth: entry.oauth,
          secret: entry.secret,
          scopes: entry.oauth ? [...(entry.piece.oauth?.scopes ?? recipe?.scopes ?? [])] : [],
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

import { setTimeout } from 'node:timers/promises';

import { KVLockContentionError } from '../../kv/errors.js';
import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import type { PieceInstance } from '../../pieces/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type {
  ConnectionID,
  ConnectionOwner,
  ConnectionStore,
  ConnectionStoredValue,
} from '../store.js';
import { OAuthError } from './error.js';
import { oauthAuth, oauthTokenMetadata, parseOAuthTokens, refreshOAuthTokens } from './tokens.js';

export async function refreshOAuthConnection({
  store,
  owner,
  piece,
  id,
  req,
}: {
  store: ConnectionStore;
  owner: ConnectionOwner;
  piece: PieceInstance;
  id: ConnectionID;
  req: FrogBotRequest;
}): Promise<ConnectionStoredValue | undefined> {
  const deadline = Date.now() + 30_000;

  for (;;) {
    try {
      return await store.withLock({
        owner,
        piece: piece.piece,
        fn: async (locked) => {
          const row = await locked.get(id);
          if (
            !row ||
            row.status !== 'active' ||
            row.method !== 'oauth' ||
            !row.expiresAt ||
            !Number.isFinite(Date.parse(row.expiresAt)) ||
            Date.parse(row.expiresAt) > Date.now()
          ) {
            return row;
          }

          const unchanged = async () => {
            const current = await locked.get(id);

            return { current, same: JSON.stringify(current) === JSON.stringify(row) };
          };

          let credential;
          let metadata;
          try {
            credential = await refreshOAuthTokens({
              piece,
              tokens: parseOAuthTokens(row.credential),
              req,
              signal: locked.signal,
            });

            oauthAuth({ piece, tokens: credential });

            metadata = oauthTokenMetadata({
              tokens: credential,
              scopes: row.scopes,
              lifetime: pieceInstanceRuntime(piece).definition.oauth?.tokenLifetime,
            });

            if (metadata.expiresAt && Date.parse(metadata.expiresAt) <= Date.now()) {
              throw new OAuthError('refresh');
            }
          } catch {
            const { current, same } = await unchanged();
            if (!same) return current;
            await locked.upsert({ ...row, status: 'error', reconnect: row.id });
            throw new OAuthError('refresh');
          }

          const { current, same } = await unchanged();
          if (!same) return current;
          const saved = await locked.upsert({
            ...row,
            ...metadata,
            credential,
            status: 'active',
            reconnect: row.id,
          });

          return { ...saved, credential };
        },
      });
    } catch (error) {
      if (!(error instanceof KVLockContentionError) || Date.now() >= deadline) throw error;
      await setTimeout(50);
    }
  }
}

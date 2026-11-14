import { pieceInstanceDefinition } from '../../pieces/definePiece.js';
import type { PieceInstance } from '../../pieces/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ConnectionID, ConnectionOwner, ConnectionStore } from '../store.js';
import { parseOAuthTokens } from './tokens.js';

const REVOKE_TIMEOUT_MS = 10_000;

/**
 * Ends the OAuth session of `owner`'s row `id` for `piece` at the provider, when the recipe can. A failure or a
 * timeout is logged, never thrown, so Disconnect still deletes the tokens.
 */
export async function revokeOAuthConnection({
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
}): Promise<void> {
  const revoke = pieceInstanceDefinition(piece).oauth?.revoke;

  if (!revoke) return;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const row = await store.get({ owner, piece: piece.piece, id });

    if (row?.method !== 'oauth') return;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), REVOKE_TIMEOUT_MS);
    });

    await Promise.race([revoke({ tokens: parseOAuthTokens(row.credential), req }), timeout]);
  } catch (error) {
    req.frogbot.logger.warn(
      `[frogbot] Couldn't revoke the '${piece.piece}' session at the provider: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

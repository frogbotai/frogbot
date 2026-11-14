import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import type { OAuthTokens, PieceInstance, PieceOAuthAccount } from '../../pieces/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ConnectionID } from '../store.js';
import type { ConnectionHolder } from '../types.js';
import { OAuthError } from './error.js';
import { oauthScopes } from './scopes.js';
import {
  lookupOAuthAccount,
  oauthAuth,
  oauthTokenMetadata,
  parseOAuthAccount,
  parseOAuthTokens,
} from './tokens.js';

/**
 * Stores finished OAuth tokens as the holder's linked account for `piece`: a user's, or an app
 * slot's. A user holder must still exist; the tokens must parse and give the piece's auth. With
 * no `account`, the recipe's `account()` looks it up. For a user, the same provider account
 * updates its row and a new one adds a row; an app slot keeps one row, which the save replaces.
 * With `reconnect`, only that row is updated, and a different provider account throws
 * `OAuthError('account')` without writing.
 */
export async function saveOAuthConnection({
  req,
  piece,
  holder,
  tokens,
  account,
  reconnect,
}: {
  req: FrogBotRequest;
  piece: PieceInstance;
  holder: ConnectionHolder;
  tokens: OAuthTokens;
  account?: PieceOAuthAccount;
  reconnect?: ConnectionID;
}): Promise<void> {
  if (holder.app === undefined) {
    const user = await req.frogbot.findByID({
      collection: holder.owner.collection,
      id: holder.owner.id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    });

    if (!user) throw new OAuthError('state');
  }

  const credential = parseOAuthTokens(tokens);

  oauthAuth({ piece, tokens: credential });

  const metadata = oauthTokenMetadata({
    tokens: credential,
    scopes: oauthScopes(piece),
    lifetime: pieceInstanceRuntime(piece).definition.oauth?.tokenLifetime,
  });

  let linked: PieceOAuthAccount | undefined;

  if (account) {
    try {
      linked = parseOAuthAccount(account);
    } catch {
      throw new OAuthError('account');
    }
  } else {
    linked = await lookupOAuthAccount({ piece, tokens: credential, req, signal: req.signal });
  }

  await (
    await req.frogbot.connections.store
  ).upsert({
    ...holder,
    piece: piece.piece,
    method: 'oauth',
    credential,
    account: linked,
    ...metadata,
    ...(reconnect === undefined ? {} : { reconnect }),
  });
}

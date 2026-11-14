import { pieceInstanceRuntime } from '../../pieces/definePiece.js';
import type { OAuthTokens, PieceInstance, PieceOAuthAccount } from '../../pieces/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { ConnectionID, ConnectionOwner } from '../store.js';
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
 * Stores finished OAuth tokens as `owner`'s linked account for `piece`. The owner must still
 * exist; the tokens must parse and give the piece's auth. With no `account`, the recipe's
 * `account()` looks it up. The same provider account updates its row; a new one adds a row. With
 * `reconnect`, only that row is updated, and a different provider account throws
 * `OAuthError('account')` without writing.
 */
export async function saveOAuthConnection({
  req,
  piece,
  owner,
  tokens,
  account,
  reconnect,
}: {
  req: FrogBotRequest;
  piece: PieceInstance;
  owner: ConnectionOwner;
  tokens: OAuthTokens;
  account?: PieceOAuthAccount;
  reconnect?: ConnectionID;
}): Promise<void> {
  const user = await req.frogbot.findByID({
    collection: owner.collection,
    id: owner.id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  });

  if (!user) throw new OAuthError('state');

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
    owner,
    piece: piece.piece,
    method: 'oauth',
    credential,
    account: linked,
    ...metadata,
    ...(reconnect === undefined ? {} : { reconnect }),
  });
}

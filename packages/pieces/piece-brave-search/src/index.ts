import * as module from '@activepieces/piece-brave-search';
import { createActivepiecesPiece, type PieceFactoryConfig } from 'frogbot/pieces';

export const braveSearchActions = ['web_search'] as const;

export function createBraveSearch(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module,
    service: 'brave',
    credentialType: 'secret_text',
    defaultActions: braveSearchActions,
    config,
  });
  return Object.assign(piece, {
    webSearch: piece.tool('web_search'),
    customApiCall: piece.tool('custom_api_call'),
  });
}

import * as module from '@activepieces/piece-exa';
import { createActivepiecesPiece, type PieceFactoryConfig } from 'frogbot/pieces';

export const exaActions = ['perform_search'] as const;

export function createExa(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module,
    service: 'exa',
    credentialType: 'secret_text',
    defaultActions: exaActions,
    config,
  });
  const tool = piece.tool;
  piece.actions = piece.actions.filter((action) => action !== 'custom_api_call');
  piece.tool = (action) => {
    if (action === 'custom_api_call') throw new Error("[frogbot] Piece 'exa' has no action 'custom_api_call'.");
    return tool(action);
  };
  return Object.assign(piece, {
    performSearch: piece.tool('perform_search'),
    getContents: piece.tool('get_contents'),
    findSimilarLinks: piece.tool('find_similar_links'),
    generateAnswer: piece.tool('generate_answer'),
  });
}

import * as module from '@activepieces/piece-data-summarizer';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const dataSummarizerActions = ['calculateAverage', 'calculateSum', 'countUniques', 'getMinMax'] as const;
export const dataSummarizer = createActivepiecesPiece({ module, service: 'data_summarizer', credentialType: 'none', defaultActions: dataSummarizerActions });

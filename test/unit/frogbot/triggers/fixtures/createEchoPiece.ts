import { definePiece } from '../../../../../packages/frogbot/src/pieces/definePiece.js';
import { defineEchoPiece } from './piece-echo.js';

export const createEchoPiece = defineEchoPiece(definePiece);

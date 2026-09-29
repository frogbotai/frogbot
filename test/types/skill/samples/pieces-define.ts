import { createPieceHelpers } from 'frogbot/pieces';

export type ExampleClient = { token: string };

export const { defineAction } = createPieceHelpers<ExampleClient>();

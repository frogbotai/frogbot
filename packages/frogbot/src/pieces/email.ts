import type { EmailAdapter as PayloadEmailAdapter } from 'payload';

import { getFrogbotInstance } from '../instanceRegistry.js';
import { isPieceInstance, pieceInstanceRuntime } from './definePiece.js';
import type { EmailPieceInstance } from './types.js';

export type EmailPiece = EmailPieceInstance;

export function isEmailPiece(value: unknown): value is EmailPiece {
  return (
    isPieceInstance(value) &&
    typeof pieceInstanceRuntime(value).definition.email?.send === 'function'
  );
}

export function pieceEmailAdapter(piece: unknown): PayloadEmailAdapter {
  if (!isPieceInstance(piece)) {
    throw new Error('email must be a piece that implements email');
  }

  const { definition, options } = pieceInstanceRuntime(piece);
  const email = definition.email;

  if (!email || typeof email.send !== 'function') {
    throw new Error(`Piece '${piece.slug}' does not implement email`);
  }

  const from =
    options && typeof options === 'object' && 'from' in options ? options.from : undefined;
  const address =
    typeof from === 'string'
      ? from
      : from && typeof from === 'object' && 'address' in from
        ? from.address
        : undefined;
  const name = from && typeof from === 'object' && 'name' in from ? from.name : undefined;

  if (
    typeof address !== 'string' ||
    !address.trim() ||
    (name !== undefined && typeof name !== 'string')
  ) {
    throw new Error(`Piece '${piece.slug}' is used as email but has no from`);
  }

  const defaultFromName = name ?? piece.slug;
  const defaultFrom = `"${defaultFromName}" <${address}>`;

  return ({ payload }) => ({
    name: piece.slug,
    defaultFromAddress: address,
    defaultFromName,
    async sendEmail(message) {
      const frogbot = getFrogbotInstance(payload);

      if (!frogbot) {
        throw new Error(`Piece '${piece.slug}' cannot send email before FrogBot is initialized`);
      }

      const req = await frogbot.createRequest();
      const client = await piece.client({ req });

      return email.send({
        message: { ...message, from: message.from ?? defaultFrom },
        client,
        options: options as object,
        req,
      });
    },
  });
}

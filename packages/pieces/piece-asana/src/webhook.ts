import type { PieceWebhook } from 'frogbot/pieces';

/**
 * Asana proves a new webhook's target by posting `X-Hook-Secret` and expecting it echoed. Each
 * delivery is signed with that secret, which only the subscription's state holds, so `verify`
 * passes everything and the trigger's `run` checks the signature.
 */
export const asanaWebhook = {
  verify() {
    return Promise.resolve(true);
  },
  handshake({ req }) {
    const secret = req.headers.get('x-hook-secret');

    return Promise.resolve(
      secret ? new Response(null, { status: 200, headers: { 'X-Hook-Secret': secret } }) : null,
    );
  },
} satisfies PieceWebhook<Record<string, never>>;

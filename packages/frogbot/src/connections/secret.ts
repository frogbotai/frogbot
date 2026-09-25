import type { Endpoint } from '../endpoints/types.js';
import { KVLockContentionError } from '../kv/errors.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { PieceJSON } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import type { SanitizedConnectionsConfig } from './types.js';

export function buildSecretEndpoints({
  connections,
  userSlug,
}: {
  connections: SanitizedConnectionsConfig;
  userSlug: string;
}): Endpoint[] {
  if (!connections.enabled) return [];
  const access = (req: FrogBotRequest) => {
    if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (req.user.collection !== userSlug) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }
  };
  const failure = (error: unknown) =>
    Response.json(
      {
        error:
          error instanceof KVLockContentionError
            ? 'Connection is busy'
            : 'Connection operation failed',
      },
      { status: error instanceof KVLockContentionError ? 409 : 500 },
    );
  return [
    {
      method: 'post',
      path: '/:piece',
      handler: async (req) => {
        const denied = access(req);
        if (denied) return denied;
        const slug = req.routeParams?.piece;
        const entry =
          typeof slug === 'string' && Object.hasOwn(connections.entries, slug)
            ? connections.entries[slug]
            : undefined;
        if (!entry?.secret) {
          return Response.json({ error: 'Connection not found' }, { status: 404 });
        }
        let credential: PieceJSON;
        try {
          const input: unknown = await req.json!();
          const schema = pieceInstanceDefinition(entry.piece).auth;
          if (!schema) throw new Error();
          schema.parse(input);
          credential = input as PieceJSON;
        } catch {
          return Response.json({ error: 'Invalid credentials' }, { status: 400 });
        }
        try {
          const metadata = await (
            await req.frogbot.connections.store
          ).upsert({
            owner: { id: req.user!.id, collection: userSlug },
            piece: entry.piece.piece,
            method: 'secret',
            credential,
          });
          return Response.json(metadata);
        } catch (error) {
          return failure(error);
        }
      },
    },
    {
      method: 'delete',
      path: '/:id',
      handler: async (req) => {
        const denied = access(req);
        if (denied) return denied;
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          return Response.json({ error: 'Connection not found' }, { status: 404 });
        }
        try {
          if (!(await req.frogbot.connections.delete({ req, id }))) {
            return Response.json({ error: 'Connection not found' }, { status: 404 });
          }
          return new Response(null, { status: 204 });
        } catch (error) {
          return failure(error);
        }
      },
    },
  ];
}

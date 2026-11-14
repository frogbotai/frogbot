import { listLinkedModels, seedLinkedModels } from '../ai/providerModels.js';
import type { Endpoint } from '../endpoints/types.js';
import { KVLockContentionError } from '../kv/errors.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { PieceJSON } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { connectionEntry } from './store.js';
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

  const param = (req: FrogBotRequest, name: string) => {
    const value = req.routeParams?.[name];

    return typeof value === 'string' && value ? value : undefined;
  };

  const save =
    (slot: boolean): Endpoint['handler'] =>
    async (req) => {
      const denied = access(req);
      if (denied) return denied;
      const app = slot ? param(req, 'app') : undefined;
      const slug = param(req, 'piece');
      const entry =
        (slot && !app) || !slug ? undefined : connectionEntry(connections, { app, piece: slug });

      if (!entry?.secret) {
        return Response.json({ error: 'Connection not found' }, { status: 404 });
      }

      const { auth: schema, label, provider } = pieceInstanceDefinition(entry.piece);
      let credential: PieceJSON;
      let auth: unknown;
      try {
        const input: unknown = await req.json!();
        if (!schema) throw new Error();
        auth = schema.parse(input);
        credential = input as PieceJSON;
      } catch {
        return Response.json({ error: 'Invalid credentials' }, { status: 400 });
      }

      let models: string[] | undefined;
      try {
        models = provider && (await listLinkedModels({ provider, auth, signal: req.signal }));
      } catch (error) {
        const status = (error as { status?: unknown } | undefined)?.status;

        return status === 401 || status === 403
          ? Response.json({ error: `${label} didn't accept this key.` }, { status: 422 })
          : Response.json(
              { error: `Couldn't reach ${label} to check this key. Try again.` },
              { status: 502 },
            );
      }

      try {
        const metadata = await (
          await req.frogbot.connections.store
        ).upsert({
          ...(app === undefined ? { owner: { id: req.user!.id, collection: userSlug } } : { app }),
          piece: entry.piece.piece,
          method: 'secret',
          credential,
        });

        if (models && app === undefined) {
          await seedLinkedModels({ req, piece: entry.piece, ids: models }).catch(() => undefined);
        }

        return Response.json(metadata);
      } catch (error) {
        return failure(error);
      }
    };

  return [
    { method: 'post', path: '/:piece', handler: save(false) },
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
    { method: 'post', path: '/app/:app/:piece', handler: save(true) },
    {
      method: 'delete',
      path: '/app/:app/:piece',
      handler: async (req) => {
        const denied = access(req);
        if (denied) return denied;
        const app = param(req, 'app');
        const piece = param(req, 'piece');

        try {
          if (!app || !piece || !(await req.frogbot.connections.deleteSlot({ req, app, piece }))) {
            return Response.json({ error: 'Connection not found' }, { status: 404 });
          }

          return new Response(null, { status: 204 });
        } catch (error) {
          return failure(error);
        }
      },
    },
    {
      method: 'post',
      path: '/:id/default',
      handler: async (req) => {
        const denied = access(req);
        if (denied) return denied;
        const id = req.routeParams?.id;
        try {
          const row =
            typeof id === 'string' && id
              ? await req.frogbot.connections.setDefault({ req, id })
              : undefined;

          return row
            ? Response.json(row)
            : Response.json({ error: 'Connection not found' }, { status: 404 });
        } catch (error) {
          return failure(error);
        }
      },
    },
  ];
}

import { listLinkedModels, seedLinkedModels } from '../ai/providerModels.js';
import type { Endpoint } from '../endpoints/types.js';
import { KVLockContentionError } from '../kv/errors.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { PieceJSON } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { describeCredentialIssues, errorResponse } from './errors.js';
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
    if (!req.user) {
      return errorResponse({
        status: 401,
        message: 'Authentication required',
        code: 'unauthorized',
      });
    }

    if (req.user.collection !== userSlug) {
      return errorResponse({ status: 403, message: 'Access denied', code: 'forbidden' });
    }
  };

  const notFound = () =>
    errorResponse({ status: 404, message: 'Connection not found', code: 'not_found' });

  const failure = (req: FrogBotRequest, error: unknown, piece?: string) => {
    if (error instanceof KVLockContentionError) {
      return errorResponse({
        status: 409,
        message: 'Connection is busy. Try again.',
        code: 'busy',
      });
    }

    req.frogbot.logger.warn({ err: error, piece }, '[frogbot] Connection operation failed');

    return errorResponse({
      status: 500,
      message: "Couldn't save the connection. Check the server log.",
      code: 'internal',
    });
  };

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

      if (!entry?.secret) return notFound();

      const { auth: schema, label, provider } = pieceInstanceDefinition(entry.piece);
      let input: unknown;
      try {
        input = await req.json!();
      } catch {
        return errorResponse({
          status: 400,
          message: "The body isn't valid JSON.",
          code: 'invalid_json',
        });
      }

      if (!schema) {
        return errorResponse({
          status: 400,
          message: `${label} takes no key.`,
          code: 'no_credentials',
        });
      }

      let parsed;
      try {
        parsed = schema.safeParse(input);
      } catch {
        parsed = undefined;
      }

      if (!parsed?.success) {
        const { message, fields } = parsed
          ? describeCredentialIssues({ issues: parsed.error.issues, input, schema })
          : { message: 'Invalid credentials: the key failed validation.', fields: [] };

        return errorResponse({
          status: 400,
          message,
          code: 'invalid_credentials',
          data: { fields },
        });
      }

      const auth: unknown = parsed.data;
      const credential = input as PieceJSON;

      let models: string[] | undefined;
      try {
        models = provider && (await listLinkedModels({ provider, auth, signal: req.signal }));
      } catch (error) {
        const status = (error as { status?: unknown } | undefined)?.status;

        return status === 401 || status === 403
          ? errorResponse({
              status: 422,
              message: `${label} didn't accept this key.`,
              code: 'rejected',
            })
          : errorResponse({
              status: 502,
              message: `Couldn't reach ${label} to check this key. Try again.`,
              code: 'unreachable',
            });
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
        return failure(req, error, entry.piece.piece);
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
          return notFound();
        }

        try {
          if (!(await req.frogbot.connections.delete({ req, id }))) {
            return notFound();
          }

          return new Response(null, { status: 204 });
        } catch (error) {
          return failure(req, error);
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
            return notFound();
          }

          return new Response(null, { status: 204 });
        } catch (error) {
          return failure(req, error);
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

          return row ? Response.json(row) : notFound();
        } catch (error) {
          return failure(req, error);
        }
      },
    },
  ];
}

import { listLinkedModels, seedLinkedModels } from '../ai/providerModels.js';
import type { Endpoint } from '../endpoints/types.js';
import { frogbotError } from '../errors/catalog.js';
import { isFrogBotError } from '../errors/FrogBotError.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { PieceJSON } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { describeCredentialIssues } from './errors.js';
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
    if (!req.user) throw frogbotError('auth.unauthenticated');

    if (req.user.collection !== userSlug) {
      throw frogbotError('auth.forbidden', 'Access denied.');
    }
  };

  const notFound = () => frogbotError('connection.not-found');

  const failure = (req: FrogBotRequest, error: unknown, piece?: string) => {
    if (isFrogBotError(error, 'kv.lock-held')) {
      return frogbotError('connection.busy', { cause: error });
    }

    if (isFrogBotError(error)) return error;

    req.frogbot.logger.warn({ err: error, piece }, '[frogbot] Connection operation failed');

    return frogbotError('connection.save-failed', { cause: error });
  };

  const param = (req: FrogBotRequest, name: string) => {
    const value = req.routeParams?.[name];

    return typeof value === 'string' && value ? value : undefined;
  };

  const save =
    (slot: boolean): Endpoint['handler'] =>
    async (req) => {
      access(req);
      const app = slot ? param(req, 'app') : undefined;
      const slug = param(req, 'piece');
      const entry =
        (slot && !app) || !slug ? undefined : connectionEntry(connections, { app, piece: slug });

      if (!entry?.secret) throw notFound();

      const { auth: schema, label, provider } = pieceInstanceDefinition(entry.piece);
      let input: unknown;
      try {
        input = await req.json!();
      } catch {
        throw frogbotError('request.invalid-json');
      }

      if (!schema) {
        throw frogbotError('connection.no-credentials', `${label} takes no key.`);
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

        throw frogbotError('connection.invalid-credentials', {
          detail: message,
          fields: fields.map((path) => ({ path, message: 'is invalid' })),
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

        throw status === 401 || status === 403
          ? frogbotError('connection.key-rejected', `${label} didn't accept this key.`)
          : frogbotError('connection.unreachable', `Couldn't reach ${label} to check this key.`);
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
        throw failure(req, error, entry.piece.piece);
      }
    };

  return [
    { method: 'post', path: '/:piece', handler: save(false) },
    {
      method: 'delete',
      path: '/:id',
      handler: async (req) => {
        access(req);
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          throw notFound();
        }

        try {
          if (!(await req.frogbot.connections.delete({ req, id }))) {
            throw notFound();
          }

          return new Response(null, { status: 204 });
        } catch (error) {
          throw failure(req, error);
        }
      },
    },
    { method: 'post', path: '/app/:app/:piece', handler: save(true) },
    {
      method: 'delete',
      path: '/app/:app/:piece',
      handler: async (req) => {
        access(req);
        const app = param(req, 'app');
        const piece = param(req, 'piece');

        try {
          if (!app || !piece || !(await req.frogbot.connections.deleteSlot({ req, app, piece }))) {
            throw notFound();
          }

          return new Response(null, { status: 204 });
        } catch (error) {
          throw failure(req, error);
        }
      },
    },
    {
      method: 'post',
      path: '/:id/default',
      handler: async (req) => {
        access(req);
        const id = req.routeParams?.id;
        try {
          const row =
            typeof id === 'string' && id
              ? await req.frogbot.connections.setDefault({ req, id })
              : undefined;

          if (!row) throw notFound();

          return Response.json(row);
        } catch (error) {
          throw failure(req, error);
        }
      },
    },
  ];
}

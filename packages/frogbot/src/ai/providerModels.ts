import { ConnectionError } from '../connections/api.js';
import { pieceInstanceDefinition } from '../pieces/definePiece.js';
import type { PieceInstance, PieceProvider } from '../pieces/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { resolveModel } from './resolve.js';
import type { SanitizedAIConfig } from './types.js';

const TTL_MS = 15 * 60 * 1000;

const LIST_TIMEOUT_MS = 10_000;

type CachedModels = { at: number; ids: Promise<ReadonlySet<string> | undefined> };

const cache = new WeakMap<object, CachedModels>();

function linkedProvider(piece: PieceInstance): PieceProvider<unknown> | undefined {
  return pieceInstanceDefinition(piece).provider;
}

function toModelIds(provider: string, ids: readonly string[]): ReadonlySet<string> {
  return new Set(ids.map((id) => `${provider}/${id}`));
}

/**
 * Lists the models an account's credential can use: the provider's `models`, with a 10-second
 * timeout. `undefined` when the provider can't list models.
 */
export async function listLinkedModels({
  provider,
  auth,
  signal,
}: {
  provider: PieceProvider<unknown>;
  auth: unknown;
  signal?: AbortSignal | null;
}): Promise<string[] | undefined> {
  if (!provider.models) return undefined;

  const timeout = AbortSignal.timeout(LIST_TIMEOUT_MS);

  return provider.models({
    auth,
    credential: provider.credential({ auth, via: 'app' }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

/** Seeds the user's model list after their key was checked on link, so the picker skips a fetch. */
export async function seedLinkedModels({
  req,
  piece,
  ids,
}: {
  req: FrogBotRequest;
  piece: PieceInstance;
  ids: readonly string[];
}): Promise<void> {
  const provider = linkedProvider(piece);

  if (!provider) return;

  const { key } = await req.frogbot.connections.resolvePieceCredential({ piece, req });

  cache.set(key, { at: Date.now(), ids: Promise.resolve(toModelIds(provider.name, ids)) });
}

/**
 * The `provider/model` IDs the user's linked account can use, cached per account for 15 minutes.
 * `undefined` when the user has no usable linked account or the listing fails.
 */
export async function linkedModels({
  req,
  piece,
}: {
  req: FrogBotRequest;
  piece: PieceInstance;
}): Promise<ReadonlySet<string> | undefined> {
  const provider = linkedProvider(piece);

  if (!provider?.models) return undefined;

  let credential: { auth: unknown; key: object };

  try {
    credential = await req.frogbot.connections.resolvePieceCredential({ piece, req });
  } catch (error) {
    if (error instanceof ConnectionError) return undefined;

    throw error;
  }

  const cached = cache.get(credential.key);

  if (cached && Date.now() - cached.at < TTL_MS) return cached.ids;

  const ids = listLinkedModels({ provider, auth: credential.auth }).then(
    (list) => list && toModelIds(provider.name, list),
    () => {
      cache.delete(credential.key);

      return undefined;
    },
  );

  cache.set(credential.key, { at: Date.now(), ids });

  return ids;
}

/** Narrows `models` to those each linked provider's account can use; other providers pass. */
export async function narrowToLinkedModels<T extends string>({
  req,
  config,
  models,
}: {
  req: FrogBotRequest;
  config: SanitizedAIConfig;
  models: readonly T[];
}): Promise<T[]> {
  const linked = config.linkedProviders ?? {};
  const lists = new Map<string, Promise<ReadonlySet<string> | undefined>>();
  const narrowed: T[] = [];

  for (const model of models) {
    const resolved = resolveModel(model, config);
    const provider = resolved.slice(0, Math.max(resolved.indexOf('/'), 0));
    const piece = Object.hasOwn(linked, provider) ? linked[provider] : undefined;

    if (piece && !lists.has(provider)) lists.set(provider, linkedModels({ req, piece }));

    const allowed = piece ? await lists.get(provider) : undefined;

    if (!allowed || allowed.has(resolved)) narrowed.push(model);
  }

  return narrowed;
}

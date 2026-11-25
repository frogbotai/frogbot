import { spaceIDOf } from '../spaces/run.js';
import type { FrogBotRequest } from '../types/request.js';
import { MemoryAdapterError } from './errors.js';
import type { MemoryOptions, MemoryScopeArgs } from './types.js';

export const builtInScopes = ['me', 'agent', 'team', 'space'] as const;

/** Every scope word the app can use, built-in words first, then custom words in declaration order. */
export function memoryScopeWords(options: MemoryOptions): string[] {
  return [...new Set([...builtInScopes, ...Object.keys(options.scopes ?? {})])];
}

function userScope(req: FrogBotRequest): string {
  const user = req.user as { collection?: unknown; id?: unknown } | null;

  if (!user || user.id === undefined || typeof user.collection !== 'string') {
    throw new MemoryAdapterError('invalid', "The 'me' memory scope needs a signed-in user.");
  }

  return `me:${user.collection}:${String(user.id)}`;
}

function spaceScope(chat: Record<string, unknown> | undefined): string {
  const id = spaceIDOf(chat?.space);

  if (id === undefined || id === '') {
    throw new MemoryAdapterError('invalid', "The 'space' memory scope needs a chat in a Space.");
  }

  return `space:${String(id)}`;
}

/** Resolves a scope word to its scope ID from the request, agent and chat. Never from model input. */
export async function resolveMemoryScope({
  options,
  scope,
  ...args
}: MemoryScopeArgs & { options: MemoryOptions; scope: string }): Promise<string> {
  if (scope === 'me') return userScope(args.req);

  if (scope === 'agent') {
    if (!args.agent) {
      throw new MemoryAdapterError('invalid', "The 'agent' memory scope needs an agent.");
    }

    return `agent:${args.agent.slug}`;
  }

  const resolve = Object.hasOwn(options.scopes ?? {}, scope) ? options.scopes?.[scope] : undefined;

  if (!resolve) {
    if (scope === 'team') return 'team';

    if (scope === 'space') return spaceScope(args.chat);

    throw new MemoryAdapterError(
      'invalid',
      `Memory scope '${scope}' is not declared. Use one of: ${memoryScopeWords(options).join(', ')}.`,
    );
  }

  const value = await resolve(args);

  if (value === undefined || value === null || value === '') {
    throw new MemoryAdapterError(
      'invalid',
      `Memory scope '${scope}' is not available for this request.`,
    );
  }

  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
    throw new MemoryAdapterError(
      'invalid',
      `Memory scope '${scope}' must resolve to a string or a finite number, such as an ID.`,
    );
  }

  return `${scope}:${String(value)}`;
}

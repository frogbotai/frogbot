import { Forbidden } from 'payload';

import { frogbotError } from '../errors/catalog.js';
import type { FrogBotError } from '../errors/FrogBotError.js';
import type { FrogBot } from '../frogbot.js';
import type { MemoryOperationKind } from './access.js';
import { checkMemoryAccess } from './access.js';
import { resolveMemoryScope } from './scopes.js';
import type { MemoryAdapter, MemoryCallArgs, MemoryTarget } from './types.js';

const MAX_KEY_LENGTH = 200;

export const MAX_TEXT_LENGTH = 4_000;

export function invalid(message: string): FrogBotError {
  return frogbotError('memory.invalid', message);
}

export function requireText(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text) throw invalid(`Memory \`${name}\` must be a non-empty string.`);

  return text;
}

export function requireMemoryText(value: unknown): string {
  const text = requireText(value, 'text');

  if (text.length > MAX_TEXT_LENGTH) {
    throw invalid(`Memory \`text\` must be at most ${MAX_TEXT_LENGTH} characters.`);
  }

  return text;
}

export function optionalKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;

  const key = requireText(value, 'key');

  if (key.length > MAX_KEY_LENGTH) {
    throw invalid(`Memory \`key\` must be at most ${MAX_KEY_LENGTH} characters.`);
  }

  return key;
}

export function optionalPinned(value: unknown): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw invalid('Memory `pinned` must be a boolean.');
  }

  return value;
}

export function requireID(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);

  return requireText(value, 'id');
}

export function boundedInteger({
  fallback,
  max,
  name,
  value,
}: {
  fallback: number;
  max: number;
  name: string;
  value: unknown;
}): number {
  if (value === undefined) return fallback;

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw invalid(`Memory \`${name}\` must be a whole number from 1 to ${max}.`);
  }

  return value;
}

function requireAdapter(frogbot: FrogBot): MemoryAdapter {
  const adapter = frogbot.config.memory;

  if (!adapter) {
    throw new Error(
      '[frogbot] Memory is not configured. Set `memory: databaseMemory()` in your FrogBot config.',
    );
  }

  return adapter;
}

function findAgent(frogbot: FrogBot, slug: unknown): { slug: string } | undefined {
  if (slug === undefined) return undefined;

  if (typeof slug !== 'string' || !frogbot.config.agents?.some((agent) => agent.slug === slug)) {
    throw invalid(`Unknown agent '${String(slug)}'.`);
  }

  return { slug };
}

/** Resolves the scope and checks access, so the adapter only ever sees a checked target. */
export async function resolveMemoryTarget({
  args,
  frogbot,
  kind,
}: {
  args: MemoryCallArgs;
  frogbot: FrogBot;
  kind: MemoryOperationKind;
}): Promise<{ adapter: MemoryAdapter; target: MemoryTarget }> {
  const adapter = requireAdapter(frogbot);
  const scope = requireText(args.scope, 'scope');

  const req = await frogbot.createRequest(args.req);

  if (args.user !== undefined) req.user = args.user;

  if (args.overrideAccess === false && scope === 'me' && !req.user) throw new Forbidden(req.t);

  const scopeId = await resolveMemoryScope({
    options: adapter,
    scope,
    req,
    agent: findAgent(frogbot, args.agent),
    chat: args.chat,
  });

  const target: MemoryTarget = { req, namespace: adapter.namespace ?? '', scope, scopeId };

  if (args.overrideAccess === false) await checkMemoryAccess({ adapter, kind, target });

  return { adapter, target };
}

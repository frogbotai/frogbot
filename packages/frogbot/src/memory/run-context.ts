import { Forbidden } from 'payload';

import type { FrogBot } from '../frogbot.js';
import type { FrogBotRequest } from '../types/request.js';
import { checkMemoryAccess } from './access.js';
import { isMemoryAdapterError } from './errors.js';
import { memoryScopeWords, resolveMemoryScope } from './scopes.js';
import type { MemoryCallArgs } from './types.js';

/** What a memory call from an agent run needs: who runs it, the agent and the chat. */
export type MemoryRunSource = {
  req: FrogBotRequest;
  frogbot: FrogBot;
  agent: { slug: string; chatId?: number | string };
  /** Whether a caller outside an agent run, such as MCP, skips `memory.access`. Defaults to `true`. */
  overrideAccess?: boolean;
};

export type MemoryResolvedScope = { scope: string; scopeId: string };

/** Memory calls for one agent run. Scope words resolve from the host, never from the model. */
export type MemoryRun = {
  /** Spread into `frogbot.memory.*`. Runs of a `memory: true` agent skip `memory.access`; other callers keep theirs. */
  callArgs: Omit<MemoryCallArgs, 'scope'>;
  /** The scope words this run can read, built-in words first, then custom words in declaration order. */
  available: () => Promise<string[]>;
  /** Each available word with its scope ID, in the same order. */
  resolved: () => Promise<MemoryResolvedScope[]>;
  /** `me` for a signed-in person, otherwise `agent`. */
  defaultScope: () => string;
  /** In a `memory: true` agent's run, whether `memory.access.write` lets the chat's person change a shared scope. Always `true` elsewhere. */
  mayWrite: (scope: string) => Promise<boolean>;
};

const runs = new WeakMap<FrogBotRequest, Map<string, Promise<MemoryRun>>>();
const agentRuns = new WeakSet<MemoryRunSource['agent']>();

/** Marks `agent` as a `memory: true` agent's own run, so its memory calls skip `memory.access`. */
export function markMemoryAgentRun<T extends MemoryRunSource['agent']>(agent: T): T {
  agentRuns.add(agent);

  return agent;
}

async function loadChat({
  agent,
  frogbot,
  req,
}: MemoryRunSource): Promise<Record<string, unknown> | undefined> {
  const chat = frogbot.config.chat;

  if (agent.chatId === undefined || !chat.enabled || !frogbot.config.memory?.scopes) {
    return undefined;
  }

  return frogbot.findByID({
    collection: chat.chatsSlug,
    id: agent.chatId,
    depth: 0,
    req,
    overrideAccess: true,
  });
}

async function createRun(source: MemoryRunSource): Promise<MemoryRun> {
  const { frogbot, req } = source;
  const memory = frogbot.config.memory;

  if (!memory) {
    throw new Error(
      '[frogbot] Memory is not configured. Set `memory: databaseMemory()` in your FrogBot config.',
    );
  }

  const own = agentRuns.has(source.agent);
  const chat = await loadChat(source);
  const agent = own ? { slug: source.agent.slug } : undefined;
  const overrideAccess = own || source.overrideAccess !== false;

  let resolved: Promise<MemoryResolvedScope[]> | undefined;

  const resolveAll = async (): Promise<MemoryResolvedScope[]> => {
    const results = await Promise.all(
      memoryScopeWords(memory).map(async (scope) => {
        try {
          const scopeId = await resolveMemoryScope({ options: memory, scope, req, agent, chat });

          if (!overrideAccess && scope !== 'me') {
            await checkMemoryAccess({
              adapter: memory,
              kind: 'read',
              target: { req, namespace: memory.namespace ?? '', scope, scopeId },
            });
          }

          return { scope, scopeId };
        } catch (error) {
          if (isMemoryAdapterError(error) || error instanceof Forbidden) return undefined;

          throw error;
        }
      }),
    );

    return results.filter((entry) => entry !== undefined);
  };

  return {
    callArgs: {
      req,
      ...(agent ? { agent: agent.slug } : {}),
      ...(chat ? { chat } : {}),
      overrideAccess,
    },
    resolved: () => (resolved ??= resolveAll()),
    available: async () => (await (resolved ??= resolveAll())).map(({ scope }) => scope),
    defaultScope: () => (req.user ? 'me' : 'agent'),
    mayWrite: async (scope) => {
      if (!own || scope === 'me' || !memory.access?.write) return true;

      const scopeId = await resolveMemoryScope({ options: memory, scope, req, agent, chat });

      return (await memory.access.write({ req, scope, scopeId })) === true;
    },
  };
}

/** The memory context of one run, built once per request and agent. */
export function memoryRun(source: MemoryRunSource): Promise<MemoryRun> {
  let byAgent = runs.get(source.req);

  if (!byAgent) {
    byAgent = new Map();
    runs.set(source.req, byAgent);
  }

  const key = [
    source.agent.slug,
    source.agent.chatId ?? '',
    source.overrideAccess !== false,
    agentRuns.has(source.agent),
  ].join('\u0000');

  let run = byAgent.get(key);

  if (!run) {
    run = createRun(source);
    byAgent.set(key, run);
    run.catch(() => byAgent.delete(key));
  }

  return run;
}

import type { ModelMessage } from 'ai';

import type { AnyTool } from '../tools/types.js';
import { memoryRun, type MemoryRunSource } from './run-context.js';
import { MEMORY_TOOL_SLUGS, memoryTools } from './tools.js';
import type { MemoryAdapter } from './types.js';

/** Checks an agent's `memory` option and returns its tools with the memory tools appended. */
export function withMemoryTools({
  memory,
  root,
  slug,
  tools,
}: {
  memory: unknown;
  root: MemoryAdapter | undefined;
  slug: string;
  tools: AnyTool[] | undefined;
}): AnyTool[] | undefined {
  if (memory === undefined || memory === false) return tools;

  if (memory !== true) {
    throw new Error(`[frogbot] Agent '${slug}' memory must be true or false.`);
  }

  if (!root) {
    throw new Error(
      `[frogbot] Agent '${slug}' sets \`memory: true\`, but memory is not configured. Set \`memory: databaseMemory()\` in your FrogBot config.`,
    );
  }

  for (const tool of tools ?? []) {
    if ((MEMORY_TOOL_SLUGS as readonly string[]).includes(tool.slug)) {
      throw new Error(`[frogbot] Tool slug '${tool.slug}' is reserved for agent memory.`);
    }
  }

  return [...(tools ?? []), ...memoryTools];
}

/** Starts the adapter's `afterTurn` without waiting for it. A throw is logged, never surfaced. */
export function startAfterTurn(source: MemoryRunSource, messages: readonly ModelMessage[]): void {
  const adapter = source.frogbot.config.memory;
  const afterTurn = adapter?.afterTurn;

  if (!adapter || !afterTurn) return;

  void (async () => {
    const run = await memoryRun(source);

    await afterTurn({
      req: source.req,
      namespace: adapter.namespace ?? '',
      scopes: await run.resolved(),
      messages,
    });
  })().catch((error: unknown) => {
    source.frogbot.logger.error({ err: error }, '[frogbot] Memory afterTurn failed.');
  });
}

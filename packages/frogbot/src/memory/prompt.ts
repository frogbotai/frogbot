import type { ModelMessage } from 'ai';

import { memoryTokens, PINNED_TOKEN_BUDGET } from './budget.js';
import { memoryRun, type MemoryRunSource } from './run-context.js';
import type { Memory } from './types.js';

/** How many memories that aren't pinned are recalled for a turn. */
export const RECALL_LIMIT = 5;

const PINNED_PAGE = 1_000;

function byPromptOrder(order: readonly string[]) {
  return (a: Memory, b: Memory) =>
    order.indexOf(a.scope) - order.indexOf(b.scope) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id);
}

/**
 * Pinned memories within the 2,000-token budget, in a fixed order: scope, then `createdAt`, then
 * `id`. The output depends only on the pinned set, so the system prompt stays cacheable.
 */
export function renderPinnedMemories({
  memories,
  scopes,
}: {
  memories: readonly Memory[];
  scopes: readonly string[];
}): string {
  const lines = [
    '## Memory',
    '',
    `You can save, search and forget memories. Scopes: ${scopes.join(', ')}.`,
  ];

  let tokens = 0;
  const pinned: string[] = [];

  for (const memory of [...memories].sort(byPromptOrder(scopes))) {
    tokens += memoryTokens(memory.text);

    if (tokens > PINNED_TOKEN_BUDGET) break;

    pinned.push(`- ${memory.text}`);
  }

  if (pinned.length > 0) lines.push('', 'Pinned memories:', ...pinned);

  return lines.join('\n');
}

/** The Memory section of an opted-in agent's system prompt. */
export async function pinnedMemoryPrompt(source: MemoryRunSource): Promise<string> {
  const run = await memoryRun(source);
  const scopes = await run.available();

  const pages = await Promise.all(
    scopes.map((scope) =>
      source.req.frogbot.memory.list({ ...run.callArgs, scope, pinned: true, limit: PINNED_PAGE }),
    ),
  );

  return renderPinnedMemories({ memories: pages.flatMap(({ docs }) => docs), scopes });
}

function lastUserIndex(messages: readonly ModelMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === 'user') return index;
  }

  return -1;
}

function textOf(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content;

  return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

/** Memories that aren't pinned and match the last user message, as one `<memories>` message. */
export async function recallMemories(
  source: MemoryRunSource,
  messages: readonly ModelMessage[],
): Promise<ModelMessage | undefined> {
  const last = messages[lastUserIndex(messages)];
  const query = last ? textOf(last).trim() : '';

  if (!query) return undefined;

  const run = await memoryRun(source);
  const scopes = await run.available();

  const hits = (
    await Promise.all(
      scopes.map((scope) =>
        source.req.frogbot.memory.search({
          ...run.callArgs,
          scope,
          query,
          limit: RECALL_LIMIT * 2,
        }),
      ),
    )
  )
    .flat()
    .filter(({ memory }) => !memory.pinned)
    .sort((a, b) => b.score - a.score)
    .slice(0, RECALL_LIMIT);

  if (hits.length === 0) return undefined;

  const lines = hits.map(({ memory }) => `- [${memory.id}] (${memory.scope}) ${memory.text}`);

  return { role: 'user', content: `<memories>\n${lines.join('\n')}\n</memories>` };
}

/** Puts the recalled message right before the last user message, after the stable prefix. */
export function withRecalled(
  messages: ModelMessage[],
  recalled: ModelMessage | undefined,
): ModelMessage[] {
  if (!recalled) return messages;

  const index = lastUserIndex(messages);

  if (index === -1) return messages;

  return [...messages.slice(0, index), recalled, ...messages.slice(index)];
}

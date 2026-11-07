import type { TextStreamPart, ToolSet } from 'ai';

import type { AnyTool, Tool, ToolCtx, ToolSource } from '../../tools/types.js';
import { isClientTool } from '../../tools/types.js';

type Part = TextStreamPart<ToolSet>;

/** The `providerMetadata` key that holds a source's record. */
export const SOURCE_METADATA_KEY = 'frogbot';

export function sourceKey({ collection, id }: Pick<ToolSource, 'collection' | 'id'>): string {
  return `${collection}:${id}`;
}

/** The keys of the record sources already on a message, so a resumed turn doesn't repeat them. */
export function seenSources(parts: readonly { type: string; sourceId?: string }[]): Set<string> {
  return new Set(
    parts.flatMap((part) =>
      part.type === 'source-document' && part.sourceId ? [part.sourceId] : [],
    ),
  );
}

/**
 * Passes every part through, and after each finished server tool call whose tool has `sources`,
 * adds one `source` part per record not yet in `seen`. A `sources` that throws is logged and adds
 * nothing.
 */
export function toolSources({
  tools,
  ctx,
  seen = new Set(),
}: {
  tools: readonly AnyTool[] | undefined;
  ctx: ToolCtx;
  seen?: Set<string>;
}): TransformStream<Part, Part> {
  const bySlug = new Map<string, Tool>(
    (tools ?? []).flatMap((tool) =>
      !isClientTool(tool) && tool.sources ? [[tool.slug, tool]] : [],
    ),
  );

  return new TransformStream({
    async transform(part, controller) {
      controller.enqueue(part);

      if (part.type !== 'tool-result' || part.preliminary) return;

      const tool = bySlug.get(part.toolName);

      if (!tool?.sources) return;

      let sources: ToolSource[];

      try {
        sources = await tool.sources(part.output, ctx);
      } catch (error) {
        ctx.req.frogbot.logger.error(
          { err: error, tool: tool.slug, chatId: ctx.agent.chatId },
          '[frogbot] A tool failed to list its sources.',
        );

        return;
      }

      for (const { collection, id, title } of sources) {
        const key = sourceKey({ collection, id });

        if (seen.has(key)) continue;

        seen.add(key);

        controller.enqueue({
          type: 'source',
          sourceType: 'document',
          id: key,
          mediaType: 'application/json',
          title: title ?? String(id),
          providerMetadata: { [SOURCE_METADATA_KEY]: { collection, id } },
        });
      }
    },
  });
}

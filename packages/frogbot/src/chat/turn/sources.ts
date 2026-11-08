import type { TextStreamPart, ToolSet, UIMessage } from 'ai';

import type { AnyTool, Tool, ToolCtx, ToolSource } from '../../tools/types.js';
import { isClientTool } from '../../tools/types.js';

export type ToolSourcesProps = {
  tools: readonly AnyTool[];
  ctx: ToolCtx;
  /** Source ids already in the message, such as on a resumed reply. */
  seen?: Iterable<string>;
};

export function sourceId({ collection, id }: Pick<ToolSource, 'collection' | 'id'>): string {
  return `${collection}:${id}`;
}

function isToolSource(source: unknown): source is ToolSource {
  const { collection, id } = (source ?? {}) as Partial<Record<keyof ToolSource, unknown>>;

  return typeof collection === 'string' && (typeof id === 'string' || typeof id === 'number');
}

/** The ids of the tool sources already on a message. */
export function messageSourceIds(message: UIMessage | undefined): string[] {
  return (message?.parts ?? []).flatMap((part) =>
    part.type === 'source-document' && part.providerMetadata?.frogbot ? [part.sourceId] : [],
  );
}

/**
 * Passes every part through and, after a server tool's final result, adds one `source` part per
 * record its `sources` returns that the message doesn't have yet. Failed calls add none.
 */
export function toolSources<TOOLS extends ToolSet>({
  tools,
  ctx,
  seen = [],
}: ToolSourcesProps): TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const withSources = new Map(
    tools.flatMap((tool) =>
      !isClientTool(tool) && tool.sources ? [[tool.slug, tool.sources] as const] : [],
    ),
  );

  const written = new Set(seen);

  const read = async (sources: NonNullable<Tool['sources']>, output: unknown, toolName: string) => {
    try {
      const listed = await sources(output, ctx);

      return Array.isArray(listed) ? listed.filter(isToolSource) : [];
    } catch (error) {
      ctx.frogbot.logger.error(
        { error, tool: toolName },
        `[frogbot] Tool \`${toolName}\` failed to list its sources.`,
      );

      return [];
    }
  };

  return new TransformStream({
    async transform(part, controller) {
      controller.enqueue(part);

      if (part.type !== 'tool-result' || part.preliminary === true) return;

      const sources = withSources.get(part.toolName);

      if (!sources) return;

      for (const source of await read(sources, part.output, part.toolName)) {
        const id = sourceId(source);

        if (written.has(id)) continue;

        written.add(id);

        controller.enqueue({
          type: 'source',
          sourceType: 'document',
          id,
          mediaType: 'application/json',
          title: source.title || String(source.id),
          providerMetadata: { frogbot: { collection: source.collection, id: source.id } },
        });
      }
    },
  });
}

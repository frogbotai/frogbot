import type { TextStreamPart, ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { seenSources, toolSources } from '../../../../../packages/frogbot/src/chat/turn/sources.js';
import type { AnyTool, ToolCtx } from '../../../../../packages/frogbot/src/tools/types.js';

type Part = TextStreamPart<ToolSet>;

function makeCtx() {
  const logger = { error: vi.fn() };
  const ctx = {
    req: { frogbot: { logger } },
    frogbot: {},
    agent: { slug: 'support', runId: 'run-1', chatId: 7 },
    overrideAccess: false,
  } as unknown as ToolCtx;

  return { ctx, logger };
}

function tool(slug: string, sources?: AnyTool['sources']): AnyTool {
  return {
    slug,
    description: slug,
    inputSchema: z.object({}),
    execute: () => ({}),
    ...(sources ? { sources } : {}),
  } as AnyTool;
}

function result(toolName: string, output: unknown, extra: Partial<Part> = {}): Part {
  return {
    type: 'tool-result',
    toolCallId: `${toolName}-call`,
    toolName,
    input: {},
    output,
    ...extra,
  } as Part;
}

async function run(parts: Part[], options: Parameters<typeof toolSources>[0]): Promise<Part[]> {
  const out: Part[] = [];
  const stream = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);

      controller.close();
    },
  }).pipeThrough(toolSources(options));

  for await (const part of stream) out.push(part);

  return out;
}

const text: Part = { type: 'text-delta', id: 't', text: 'Hi' };

describe('toolSources', () => {
  it('adds one source part per record after a tool result', async () => {
    const { ctx } = makeCtx();
    const sources = vi.fn(() => [
      { collection: 'articles', id: 1, title: 'Frogs' },
      { collection: 'articles', id: 'b2' },
    ]);

    const out = await run([result('search', { hits: [] }), text], {
      tools: [tool('search', sources)],
      ctx,
    });

    expect(sources).toHaveBeenCalledWith({ hits: [] }, ctx);
    expect(out.map((part) => part.type)).toEqual(['tool-result', 'source', 'source', 'text-delta']);
    expect(out[1]).toEqual({
      type: 'source',
      sourceType: 'document',
      id: 'articles:1',
      mediaType: 'application/json',
      title: 'Frogs',
      providerMetadata: { frogbot: { collection: 'articles', id: 1 } },
    });
    expect(out[2]).toMatchObject({ id: 'articles:b2', title: 'b2' });
  });

  it('adds a record once per message, counting the ones already on it', async () => {
    const { ctx } = makeCtx();
    const sources = () => [
      { collection: 'articles', id: 1 },
      { collection: 'articles', id: 2 },
    ];

    const out = await run([result('search', {}), result('search', {})], {
      tools: [tool('search', sources)],
      ctx,
      seen: seenSources([{ type: 'source-document', sourceId: 'articles:2' }, { type: 'text' }]),
    });

    expect(
      out.filter((part) => part.type === 'source').map((part) => 'id' in part && part.id),
    ).toEqual(['articles:1']);
  });

  it('adds nothing for errors, preliminary results, other tools and client tools', async () => {
    const { ctx } = makeCtx();
    const sources = vi.fn(() => [{ collection: 'articles', id: 1 }]);
    const parts: Part[] = [
      { type: 'tool-error', toolCallId: 'x', toolName: 'search', input: {}, error: 'no' },
      result('search', {}, { preliminary: true }),
      result('plain', {}),
      result('ask', {}),
    ];

    const out = await run(parts, {
      tools: [
        tool('search', sources),
        tool('plain'),
        { ...tool('ask', sources), client: { kind: 'ask' } } as AnyTool,
      ],
      ctx,
    });

    expect(out).toEqual(parts);
    expect(sources).not.toHaveBeenCalled();
  });

  it('logs a sources failure and keeps streaming', async () => {
    const { ctx, logger } = makeCtx();

    const out = await run([result('search', {}), text], {
      tools: [
        tool('search', () => {
          throw new Error('boom');
        }),
      ],
      ctx,
    });

    expect(out.map((part) => part.type)).toEqual(['tool-result', 'text-delta']);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'search', chatId: 7 }),
      '[frogbot] A tool failed to list its sources.',
    );
  });
});

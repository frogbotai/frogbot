import type { TextStreamPart, ToolSet, UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  messageSourceIds,
  toolSources,
} from '../../../../../packages/frogbot/src/chat/turn/sources.js';
import type { AnyTool, ToolCtx } from '../../../../../packages/frogbot/src/tools/types.js';

type Part = TextStreamPart<ToolSet>;

function makeCtx() {
  const error = vi.fn();
  const frogbot = { logger: { error } };

  return {
    ctx: {
      req: { frogbot },
      frogbot,
      agent: { slug: 'support', runId: 'run-1' },
      overrideAccess: false,
    } as unknown as ToolCtx,
    error,
  };
}

function tool(slug: string, sources?: AnyTool['sources']): AnyTool {
  return {
    slug,
    description: slug,
    inputSchema: z.object({}),
    execute: () => ({}),
    ...(sources ? { sources } : {}),
  };
}

function result(toolName: string, output: unknown, extra: Partial<Part> = {}): Part {
  return {
    type: 'tool-result',
    toolCallId: `call-${toolName}`,
    toolName,
    input: {},
    output,
    ...extra,
  } as Part;
}

async function run(parts: Part[], props: Parameters<typeof toolSources>[0]): Promise<Part[]> {
  const out: Part[] = [];
  const stream = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);

      controller.close();
    },
  }).pipeThrough(toolSources(props));

  for await (const part of stream) out.push(part);

  return out;
}

const search = tool('search', (output) =>
  (output as { ids: number[] }).ids.map((id) => ({ collection: 'posts', id, title: `Post ${id}` })),
);

describe('toolSources', () => {
  it('writes one document source per record after the tool result', async () => {
    const { ctx } = makeCtx();
    const parts = await run([result('search', { ids: [1, 2] })], { tools: [search], ctx });

    expect(parts.map((part) => part.type)).toEqual(['tool-result', 'source', 'source']);
    expect(parts[1]).toEqual({
      type: 'source',
      sourceType: 'document',
      id: 'posts:1',
      mediaType: 'application/json',
      title: 'Post 1',
      providerMetadata: { frogbot: { collection: 'posts', id: 1 } },
    });
  });

  it('passes the call ctx and the raw result to sources', async () => {
    const { ctx } = makeCtx();
    const sources = vi.fn().mockReturnValue([]);

    await run([result('lookup', { raw: true })], { tools: [tool('lookup', sources)], ctx });

    expect(sources).toHaveBeenCalledWith({ raw: true }, ctx);
  });

  it('writes a record once per message, counting sources already on it', async () => {
    const { ctx } = makeCtx();
    const parts = await run(
      [result('search', { ids: [1, 2] }), result('search', { ids: [2, 3] })],
      {
        tools: [search],
        ctx,
        seen: ['posts:3'],
      },
    );

    expect(parts.filter((part) => part.type === 'source').map((part) => part.id)).toEqual([
      'posts:1',
      'posts:2',
    ]);
  });

  it('titles a source by its id when the tool gives no title', async () => {
    const { ctx } = makeCtx();
    const untitled = tool('find', () => [{ collection: 'posts', id: 'abc' }]);
    const parts = await run([result('find', {})], { tools: [untitled], ctx });

    expect(parts[1]).toMatchObject({ type: 'source', title: 'abc' });
  });

  it('titles a source by its id when the tool gives an empty title', async () => {
    const { ctx } = makeCtx();
    const blank = tool('find', () => [{ collection: 'posts', id: 7, title: '' }]);
    const parts = await run([result('find', {})], { tools: [blank], ctx });

    expect(parts[1]).toMatchObject({ type: 'source', title: '7' });
  });

  it('skips malformed sources entries and keeps streaming', async () => {
    const { ctx } = makeCtx();
    const malformed = tool(
      'malformed',
      () =>
        [
          null,
          'posts:1',
          { collection: 'posts' },
          { collection: 1, id: 2 },
          { collection: 'posts', id: {} },
          { collection: 'posts', id: 3 },
        ] as never,
    );

    const parts = await run(
      [result('malformed', {}), { type: 'text-delta', id: 't', text: 'Answer' }],
      { tools: [malformed], ctx },
    );

    expect(parts.map((part) => (part.type === 'source' ? part.id : part.type))).toEqual([
      'tool-result',
      'posts:3',
      'text-delta',
    ]);
  });

  it('adds nothing for a failed call, a preliminary result or a tool without sources', async () => {
    const { ctx } = makeCtx();
    const error = {
      type: 'tool-error',
      toolCallId: 'x',
      toolName: 'search',
      input: {},
      error: new Error('boom'),
    } as Part;

    const parts = await run(
      [error, result('search', { ids: [1] }, { preliminary: true }), result('other', { ids: [1] })],
      { tools: [search, tool('other')], ctx },
    );

    expect(parts.map((part) => part.type)).toEqual(['tool-error', 'tool-result', 'tool-result']);
  });

  it('logs a throwing sources and keeps streaming', async () => {
    const { ctx, error } = makeCtx();
    const broken = tool('broken', () => {
      throw new Error('lookup failed');
    });

    const parts = await run(
      [result('broken', {}), { type: 'text-delta', id: 't', text: 'Answer' }],
      { tools: [broken], ctx },
    );

    expect(parts.map((part) => part.type)).toEqual(['tool-result', 'text-delta']);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('messageSourceIds', () => {
  it('lists the tool sources on a message, not provider ones', () => {
    const message = {
      id: 'm',
      role: 'assistant',
      parts: [
        {
          type: 'source-document',
          sourceId: 'posts:1',
          mediaType: 'application/json',
          title: 'Post 1',
          providerMetadata: { frogbot: { collection: 'posts', id: 1 } },
        },
        { type: 'source-document', sourceId: 'doc', mediaType: 'application/pdf', title: 'PDF' },
        { type: 'text', text: 'Hi' },
      ],
    } as UIMessage;

    expect(messageSourceIds(message)).toEqual(['posts:1']);
    expect(messageSourceIds(undefined)).toEqual([]);
  });
});

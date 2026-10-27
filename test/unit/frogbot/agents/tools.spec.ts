import type { LanguageModelV4GenerateResult, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  MAX_TOOL_OUTPUT_BYTES,
  MAX_TOOL_OUTPUT_LINES,
  toAISDKTools,
  toAISDKToolsContext,
} from '../../../../packages/frogbot/src/agents/tools.js';
import type { AnyTool, Tool, ToolCtx } from '../../../../packages/frogbot/src/tools/types.js';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const ctx = {} as ToolCtx;

function lookup(execute: () => unknown, maxOutput?: Tool['maxOutput']): AnyTool {
  return {
    slug: 'lookup',
    description: 'Look something up',
    inputSchema: z.object({}),
    execute,
    ...(maxOutput !== undefined && { maxOutput }),
  };
}

async function modelSees(tool: AnyTool): Promise<unknown> {
  const prompts: LanguageModelV4Prompt[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: ({ prompt }) => {
      prompts.push(prompt);

      return Promise.resolve<LanguageModelV4GenerateResult>(
        prompts.length === 1
          ? {
              content: [
                { type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: '{}' },
              ],
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage,
              warnings: [],
            }
          : {
              content: [{ type: 'text', text: 'Done' }],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
              warnings: [],
            },
      );
    },
  });

  await generateText({
    model,
    prompt: 'Look it up',
    tools: toAISDKTools([tool]),
    toolsContext: toAISDKToolsContext([tool], ctx),
    stopWhen: ({ steps }) => steps.length === 2,
  });

  const result = prompts[1]
    ?.flatMap((message) => (message.role === 'tool' ? message.content : []))
    .find((part) => part.type === 'tool-result');

  return result?.output;
}

function numbered(count: number, line = (index: number) => `line ${index + 1}`): string {
  return Array.from({ length: count }, (_, index) => line(index)).join('\n');
}

describe('toAISDKTools output cap', () => {
  it('sends a result within the limits unchanged', async () => {
    const text = numbered(MAX_TOOL_OUTPUT_LINES);

    await expect(modelSees(lookup(() => text))).resolves.toEqual({ type: 'text', value: text });
    await expect(modelSees(lookup(() => ({ found: [1, 2] })))).resolves.toEqual({
      type: 'json',
      value: { found: [1, 2] },
    });
  });

  it('cuts a result past the line limit to the leading lines', async () => {
    const output = await modelSees(lookup(() => numbered(MAX_TOOL_OUTPUT_LINES + 500)));

    expect(output).toEqual({
      type: 'text',
      value: `${numbered(MAX_TOOL_OUTPUT_LINES)}\n[showing lines 1-2000 of 2500; output truncated]`,
    });
  });

  it('cuts a result past the byte limit at a whole line, counting UTF-8 bytes', async () => {
    const line = 'ü'.repeat(99);
    const output = (await modelSees(lookup(() => numbered(400, () => line)))) as {
      value: string;
    };

    const kept = Math.floor((MAX_TOOL_OUTPUT_BYTES + 1) / (Buffer.byteLength(line) + 1));

    expect(output.value).toBe(
      `${numbered(kept, () => line)}\n[showing lines 1-${kept} of 400; output truncated]`,
    );
    expect(Buffer.byteLength(output.value.slice(0, output.value.lastIndexOf('\n')))).toBeLessThan(
      MAX_TOOL_OUTPUT_BYTES,
    );
  });

  it('sends only the note for a single line over the byte limit', async () => {
    const output = await modelSees(lookup(() => 'x'.repeat(MAX_TOOL_OUTPUT_BYTES + 1)));

    expect(output).toEqual({ type: 'text', value: '[showing 0 lines of 1; output truncated]' });
  });

  it('cuts a large JSON result at whole lines of its indented form', async () => {
    const output = await modelSees(
      lookup(() => ({ rows: Array.from({ length: 3000 }, (_, i) => i) })),
    );

    expect(output).toEqual({
      type: 'text',
      value: `{\n  "rows": [\n${numbered(1998, (index) => `    ${index},`)}\n[showing lines 1-2000 of 3004; output truncated]`,
    });
  });

  it("applies a tool's own limits", async () => {
    const output = await modelSees(lookup(() => numbered(10), { lines: 3 }));

    expect(output).toEqual({
      type: 'text',
      value: `${numbered(3)}\n[showing lines 1-3 of 10; output truncated]`,
    });
  });

  it('sends the whole result when a tool turns the cap off', async () => {
    const text = numbered(MAX_TOOL_OUTPUT_LINES + 1);

    await expect(modelSees(lookup(() => text, false))).resolves.toEqual({
      type: 'text',
      value: text,
    });
  });

  it('sends a thrown error whole', async () => {
    const error = new Error(numbered(MAX_TOOL_OUTPUT_LINES + 1));

    await expect(
      modelSees(
        lookup(() => {
          throw error;
        }),
      ),
    ).resolves.toEqual({ type: 'error-text', value: String(error) });
  });
});

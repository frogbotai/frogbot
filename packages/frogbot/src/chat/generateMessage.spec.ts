import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';

import type { AgentGenerateResult } from '../types/agent.js';
import { generateMessage } from './generateMessage.js';

describe('generateMessage', () => {
  it('converts multi-step generated content into a persisted UI message', async () => {
    const originalMessages: UIMessage[] = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    const result = {
      finishReason: 'stop',
      rawFinishReason: 'stop',
      totalUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      steps: [
        {
          content: [
            { type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: { query: 'frog' } },
            { type: 'tool-result', toolCallId: 'call-1', toolName: 'lookup', input: { query: 'frog' }, output: 'found' },
          ],
        },
        { content: [{ type: 'text', text: 'Found it' }] },
      ],
    } as unknown as AgentGenerateResult;

    const message = await generateMessage({
      result,
      originalMessages,
      tools: { lookup: {} },
      model: 'openai/test',
    });

    expect(message.role).toBe('assistant');
    expect(message.parts).toEqual([
      { type: 'step-start' },
      {
        type: 'tool-lookup',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { query: 'frog' },
        output: 'found',
      },
      { type: 'step-start' },
      { type: 'text', text: 'Found it', state: 'done' },
    ]);
    expect(message.metadata).toEqual({
      usage: expect.objectContaining({ totalTokens: 5, model: 'openai/test', provider: 'openai' }),
    });
  });
});

import { describe, expect, it } from 'vitest';
import { parseUserMessage } from './toModelMessages/user.js';
import { parseAssistantMessage } from './toModelMessages/assistant.js';
import { parseSystemMessage } from './toModelMessages/system.js';
import type { OpenAIUserMessage, OpenAIAssistantMessage, OpenAISystemMessage } from './types.js';

describe('cache_control on messages', () => {
  describe('system message', () => {
    it('propagates cache_control to providerOptions.unknown', () => {
      const msg: OpenAISystemMessage = {
        role: 'system',
        content: 'You are helpful.',
        cache_control: { type: 'ephemeral' },
      };
      const result = parseSystemMessage(msg);
      expect(result.providerOptions).toEqual({ unknown: { cache_control: { type: 'ephemeral' } } });
    });

    it('omits providerOptions when no cache_control', () => {
      const msg: OpenAISystemMessage = { role: 'system', content: 'Hello' };
      const result = parseSystemMessage(msg);
      expect(result.providerOptions).toBeUndefined();
    });
  });

  describe('user message', () => {
    it('propagates cache_control on string content', () => {
      const msg: OpenAIUserMessage = {
        role: 'user',
        content: 'Hi',
        cache_control: { type: 'ephemeral' },
      };
      const result = parseUserMessage(msg, 0);
      expect(result.providerOptions).toEqual({ unknown: { cache_control: { type: 'ephemeral' } } });
    });

    it('propagates cache_control on content parts', () => {
      const msg: OpenAIUserMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'Hello', cache_control: { type: 'ephemeral' } }],
      };
      const result = parseUserMessage(msg, 0);
      const parts = result.content as Array<{ type: string; providerOptions?: unknown }>;
      expect(parts[0].providerOptions).toEqual({ unknown: { cache_control: { type: 'ephemeral' } } });
    });

    it('omits providerOptions on parts without cache_control', () => {
      const msg: OpenAIUserMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      };
      const result = parseUserMessage(msg, 0);
      const parts = result.content as Array<{ type: string; providerOptions?: unknown }>;
      expect(parts[0].providerOptions).toBeUndefined();
    });
  });

  describe('assistant message', () => {
    it('propagates cache_control on plain text message', () => {
      const msg: OpenAIAssistantMessage = {
        role: 'assistant',
        content: 'Hello',
        cache_control: { type: 'ephemeral' },
      };
      const result = parseAssistantMessage(msg, 0);
      expect(result.providerOptions).toEqual({ unknown: { cache_control: { type: 'ephemeral' } } });
    });

    it('propagates cache_control on message with tool_calls', () => {
      const msg: OpenAIAssistantMessage = {
        role: 'assistant',
        content: '',
        cache_control: { type: 'ephemeral' },
        tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'foo', arguments: '{}' } }],
      };
      const result = parseAssistantMessage(msg, 0);
      expect(result.providerOptions).toEqual({ unknown: { cache_control: { type: 'ephemeral' } } });
    });
  });
});

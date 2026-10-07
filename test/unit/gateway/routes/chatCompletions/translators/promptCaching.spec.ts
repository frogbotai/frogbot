import { describe, expect, it } from 'vitest';

import { parseAssistantMessage } from '../../../../../../packages/gateway/src/routes/chatCompletions/translators/toModelMessages/assistant.js';
import {
  parseSystemMessage,
  parseSystemMessages,
} from '../../../../../../packages/gateway/src/routes/chatCompletions/translators/toModelMessages/system.js';
import { parseUserMessage } from '../../../../../../packages/gateway/src/routes/chatCompletions/translators/toModelMessages/user.js';
import type {
  OpenAIAssistantMessage,
  OpenAISystemMessage,
  OpenAIUserMessage,
} from '../../../../../../packages/gateway/src/routes/chatCompletions/translators/types.js';

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

    it('keeps part-level cache_control by splitting parts into system messages', () => {
      const msg: OpenAISystemMessage = {
        role: 'system',
        content: [
          { type: 'text', text: 'Long policy.', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'Today is Monday.' },
        ],
      };

      expect(parseSystemMessages(msg)).toEqual([
        {
          role: 'system',
          content: 'Long policy.',
          providerOptions: { unknown: { cache_control: { type: 'ephemeral' } } },
        },
        { role: 'system', content: 'Today is Monday.' },
      ]);
    });

    it('joins parts into one message when no part carries cache_control', () => {
      const msg: OpenAISystemMessage = {
        role: 'system',
        content: [
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' },
        ],
      };

      expect(parseSystemMessages(msg)).toEqual([{ role: 'system', content: 'AB' }]);
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

      expect(parts[0].providerOptions).toEqual({
        unknown: { cache_control: { type: 'ephemeral' } },
      });
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

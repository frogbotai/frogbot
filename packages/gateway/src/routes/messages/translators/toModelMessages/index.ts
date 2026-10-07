import type { ModelMessage } from '@ai-sdk/provider-utils';

import { createLogger, type GatewayLogger } from '../../../../observability/logger.js';
import type { AnthropicMessage, AnthropicSystemParam } from '../types.js';
import { parseAssistantMessage } from './assistant.js';
import { parseSystemParam } from './system.js';
import { parseUserMessage } from './user.js';

/**
 * Convert an Anthropic /v1/messages request body into AI SDK ModelMessage[].
 *
 * The `toolNameMap` is built incrementally as assistant messages stream in
 * — Anthropic guarantees a `tool_use` block precedes its correlated
 * `tool_result`, so a single pass suffices (no pre-pass needed).
 */
export function toModelMessages(args: {
  messages: AnthropicMessage[];
  system?: AnthropicSystemParam | null;
  logger?: GatewayLogger;
}): ModelMessage[] {
  const { messages, system, logger = createLogger() } = args;
  const out: ModelMessage[] = [];

  out.push(...parseSystemParam(system));

  const toolNameMap = new Map<string, string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      const parsed = parseUserMessage(msg, i, toolNameMap);

      for (const m of parsed) {
        out.push(m);
      }

      continue;
    }

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolNameMap.set(block.id, block.name);
        }
      }
    }

    out.push(parseAssistantMessage(msg, i, logger));
  }

  return out;
}

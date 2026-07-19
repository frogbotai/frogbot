// Anthropic /v1/messages request → AI SDK ModelMessage[] translation.
//
// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------
// The request-side translator inverts `convertToAnthropicPrompt` from the
// Vercel AI SDK (Apache-2.0). Each block-type branch below maps 1:1 to a
// branch in the upstream converter — when the upstream learns a new content
// type, update the corresponding branch here.
//
// Source files:
//   - packages/anthropic/src/convert-to-anthropic-prompt.ts
//   - packages/anthropic/src/anthropic-api.ts
//
// Original copyright © Vercel, Inc. Licensed under Apache-2.0.
// Adapted for the gateway under MIT.
// ---------------------------------------------------------------------------
//
// Key inversions from the AI SDK's outbound converter:
//
// | AI SDK → Anthropic                                    | Anthropic → AI SDK (this file)               |
// |-------------------------------------------------------|----------------------------------------------|
// | `system` msgs → top-level `system` param              | top-level `system` → { role: 'system' }      |
// | `tool` msgs merge into `user` msg as tool_result      | tool_result blocks split back to `role:tool` |
// | tool-call.input → tool_use.input (object)             | tool_use.input → tool-call.input             |
// | reasoning → { type: 'thinking', thinking, signature } | thinking → { type: 'reasoning', text }       |
// | text string → { type: 'text', text }                  | text block → text part                       |
// | file part (image) → { type: 'image', source }         | image block → file part                      |

import type { ModelMessage } from '@ai-sdk/provider-utils';

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
}): ModelMessage[] {
  const { messages, system } = args;
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

    // assistant: index tool_use IDs, then convert.
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolNameMap.set(block.id, block.name);
        }
      }
    }
    out.push(parseAssistantMessage(msg, i));
  }

  return out;
}

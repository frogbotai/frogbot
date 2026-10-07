import type {
  FilePart,
  ImagePart,
  ProviderOptions,
  TextPart,
  ToolModelMessage,
  ToolResultPart,
  UserModelMessage,
} from '@ai-sdk/provider-utils';
import type { JSONValue } from 'ai';

import { UnsupportedModalityError } from '../../../../errors/gatewayError.js';
import { parseJsonOrText } from '../../../../shared/parseJsonOrText.js';
import type {
  AnthropicDocumentBlock,
  AnthropicMediaSource,
  AnthropicToolResultBlock,
  AnthropicUserBlock,
  AnthropicUserMessage,
} from '../types.js';

type UserPart = TextPart | ImagePart | FilePart;

/**
 * Convert one Anthropic user message into AI SDK messages.
 *
 * Anthropic packs both real user content AND tool results into the same
 * `role: 'user'` message with mixed content blocks. We split them into
 * contiguous `user`/`tool` runs so the AI SDK sees the shape it expects.
 *
 * Contiguity is preserved: [text, tool_result, tool_result, text] becomes
 * user → tool → user (not user → tool → user with a merged text at the end).
 */
export function parseUserMessage(
  msg: AnthropicUserMessage,
  messageIndex: number,
  toolNameMap: Map<string, string>,
): Array<UserModelMessage | ToolModelMessage> {
  if (typeof msg.content === 'string') {
    return [{ role: 'user', content: msg.content }];
  }

  const out: Array<UserModelMessage | ToolModelMessage> = [];
  let userBuf: UserPart[] = [];
  let toolBuf: ToolResultPart[] = [];

  const flushUser = () => {
    if (userBuf.length === 0) return;
    out.push({ role: 'user', content: userBuf });
    userBuf = [];
  };

  const flushTool = () => {
    if (toolBuf.length === 0) return;
    out.push({ role: 'tool', content: toolBuf });
    toolBuf = [];
  };

  for (let j = 0; j < msg.content.length; j++) {
    const block = msg.content[j];
    const path = `messages[${messageIndex}].content[${j}]`;

    if (block.type === 'tool_result') {
      flushUser();
      toolBuf.push(parseToolResult(block, toolNameMap));
      continue;
    }

    flushTool();

    const part = parseUserContentBlock(block, path);
    if (part) {
      userBuf.push(part);
    }
  }

  flushUser();
  flushTool();

  return out.length > 0 ? out : [{ role: 'user', content: '' }];
}

function parseUserContentBlock(
  block: Exclude<AnthropicUserBlock, AnthropicToolResultBlock>,
  path: string,
): UserPart | undefined {
  switch (block.type) {
    case 'text': {
      const part: TextPart = { type: 'text', text: block.text };
      if (block.cache_control) {
        part.providerOptions = {
          unknown: { cache_control: block.cache_control },
        };
      }

      return part;
    }

    case 'image': {
      const part = mediaSourceToFilePart(block.source, 'image', path);
      if (block.cache_control) {
        part.providerOptions = {
          unknown: { cache_control: block.cache_control },
        };
      }

      return part;
    }

    case 'document': {
      const src = block.source;
      const part: FilePart =
        src.type === 'text'
          ? {
              type: 'file',
              mediaType: src.media_type ?? 'text/plain',
              data: { type: 'text', text: src.data },
            }
          : mediaSourceToFilePart(src, 'application/pdf', path);

      const providerOptions = documentProviderOptions(block);
      if (providerOptions) {
        part.providerOptions = providerOptions;
      }

      return part;
    }

    default: {
      const blockType: unknown = Reflect.get(block, 'type');
      throw new UnsupportedModalityError({
        provider: 'anthropic',
        modality: `content block type "${String(blockType)}"`,
        param: `${path}.type`,
      });
    }
  }
}

function mediaSourceToFilePart(
  source: AnthropicMediaSource,
  fallbackMediaType: string,
  path: string,
): FilePart {
  switch (source.type) {
    case 'base64':
      return {
        type: 'file',
        mediaType: source.media_type,
        data: { type: 'data', data: source.data },
      };
    case 'url':
      return {
        type: 'file',
        mediaType: source.media_type ?? fallbackMediaType,
        data: { type: 'url', url: new URL(source.url) },
      };
    default: {
      const sourceType: unknown = Reflect.get(source, 'type');
      throw new UnsupportedModalityError({
        provider: 'anthropic',
        modality: `source type "${String(sourceType)}"`,
        param: `${path}.source.type`,
      });
    }
  }
}

function documentProviderOptions(block: AnthropicDocumentBlock): ProviderOptions | undefined {
  const anthropic: Record<string, JSONValue> = {};
  if (block.title) {
    anthropic.title = block.title;
  }

  if (block.context) {
    anthropic.context = block.context;
  }

  if (block.citations?.enabled) {
    anthropic.citations = { enabled: true };
  }

  const providerOptions: ProviderOptions = {};
  if (Object.keys(anthropic).length > 0) {
    providerOptions.anthropic = anthropic;
  }

  if (block.cache_control) {
    providerOptions.unknown = { cache_control: block.cache_control };
  }

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

function parseToolResult(
  block: AnthropicToolResultBlock,
  toolNameMap: Map<string, string>,
): ToolResultPart {
  const output = toolResultOutput(block);

  const result: ToolResultPart = {
    type: 'tool-result',
    toolCallId: block.tool_use_id,
    toolName: toolNameMap.get(block.tool_use_id) ?? '',
    output,
  };

  if (block.cache_control) {
    result.providerOptions = {
      unknown: { cache_control: block.cache_control },
    };
  }

  return result;
}

function toolResultOutput(block: AnthropicToolResultBlock): ToolResultPart['output'] {
  if (block.content == null) {
    return { type: 'text', value: '' };
  }

  if (typeof block.content === 'string') {
    return parseJsonOrText(block.content);
  }

  const parts: Extract<ToolResultPart['output'], { type: 'content' }>['value'] = [];

  for (const sub of block.content) {
    if (sub.type === 'text') {
      parts.push({ type: 'text', text: sub.text });
    } else if (sub.type === 'image') {
      if (sub.source.type === 'base64') {
        parts.push({
          type: 'image-data',
          data: sub.source.data,
          mediaType: sub.source.media_type,
        });
      } else {
        parts.push({ type: 'image-url', url: sub.source.url });
      }
    }
  }

  return { type: 'content', value: parts };
}

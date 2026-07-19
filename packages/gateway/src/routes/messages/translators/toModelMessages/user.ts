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

    // Non-tool_result → user part. Flush any pending tool run first.
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

// ---------------------------------------------------------------------------
// Individual block parsers
// ---------------------------------------------------------------------------

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
      // Anthropic documents can be base64/url binary or inline text. All map to
      // AI SDK `file` parts — the text variant becomes a `{ type: 'text' }` file
      // part (not a plain TextPart) so the anthropic provider routes it back to
      // a `document` block and honors title/context/citations.
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
      // Reachable at runtime because the request schema allows unknown block
      // types through as a forward-compat catch-all; TS considers it `never`
      // once the strict union is exhausted.
      const unknown = block as unknown as { type: string };
      throw new UnsupportedModalityError({
        provider: 'anthropic',
        modality: `content block type "${unknown.type}"`,
        param: `${path}.type`,
      });
    }
  }
}

function mediaSourceToFilePart(source: AnthropicMediaSource, fallbackMediaType: string, path: string): FilePart {
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
      // Reachable at runtime if AnthropicMediaSource grows a new variant
      // before we update the types.
      const unknown = source as unknown as { type: string };
      throw new UnsupportedModalityError({
        provider: 'anthropic',
        modality: `source type "${unknown.type}"`,
        param: `${path}.source.type`,
      });
    }
  }
}

// Build the providerOptions for a document block. Anthropic document features
// (title/context/citations) are file-part options the AI SDK reads from the
// `anthropic` namespace with camelCase keys; cache_control rides `unknown` and
// forwardLanguageParams re-homes it to the SDK namespace after hooks run.
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

function parseToolResult(block: AnthropicToolResultBlock, toolNameMap: Map<string, string>): ToolResultPart {
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
    // Preserve structure when the tool result is JSON — matches OpenAI
    // translator behavior so downstream reasoning can see typed output.
    return parseJsonOrText(block.content);
  }

  // Array of sub-blocks: text | image. Convert to AI SDK content list.
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

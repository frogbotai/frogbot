import type { AssistantModelMessage, ModelMessage, UserModelMessage } from 'ai';

import { RequestValidationError, UnsupportedModalityError } from '../../../errors/gatewayError.js';
import { parseDataUrl } from '../../../utils/parseDataUrl.js';
import type { ResponsesInputItem, ResponsesInputMessage } from '../schema.js';

type ResponsesInputPart = {
  type: string;
  text?: string;
  image_url?: string | null;
  file_url?: string | null;
  file_data?: string | null;
  file_id?: string | null;
  filename?: string | null;
  input_audio?: { data: string; format: string };
};

const AUDIO_FORMAT_MIME: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  opus: 'audio/opus',
  pcm16: 'audio/l16',
};

export function toModelMessages(input: string | ResponsesInputItem[]): ModelMessage[] {
  if (typeof input === 'string') return [{ role: 'user', content: input }];

  // A `function_call_output` has no `name` in the OpenAI wire format; the tool
  // name is resolved from the matching `function_call` earlier in the input.
  const toolNameByCallId = new Map<string, string>();
  for (const item of input) {
    if (!('role' in item) && 'type' in item && item.type === 'function_call') {
      toolNameByCallId.set(item.call_id, item.name);
    }
  }

  return input.map((item, index): ModelMessage => {
    if (!('role' in item) && 'type' in item && item.type != null) {
      const path = `input[${index}]`;
      switch (item.type) {
        case 'function_call':
          return {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: item.call_id,
                toolName: item.name,
                input: parseToolArguments(item.arguments, `${path}.arguments`),
              },
            ],
          };
        case 'function_call_output':
          return {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: item.call_id,
                toolName: toolNameByCallId.get(item.call_id) ?? 'unknown',
                output: { type: 'text', value: item.output },
              },
            ],
          };
        case 'reasoning':
          return {
            role: 'assistant',
            content: (item.summary ?? []).map((part) => ({
              type: 'reasoning',
              text: part.text,
              providerOptions: {
                openai: {
                  ...(item.id != null ? { itemId: item.id } : {}),
                  ...(item.encrypted_content != null ? { reasoningEncryptedContent: item.encrypted_content } : {}),
                },
              },
            })),
          };
        case 'item_reference':
          throw new RequestValidationError({
            message:
              'item_reference input items require server-side conversation state, which this stateless gateway cannot resolve.',
            param: `${path}.type`,
          });
      }
    }

    return messageToModelMessage(item as ResponsesInputMessage, index);
  });
}

function messageToModelMessage(message: ResponsesInputMessage, messageIndex: number): ModelMessage {
  const role = message.role === 'developer' ? 'system' : message.role;

  if (typeof message.content === 'string') {
    return { role, content: message.content };
  }

  // Assistant messages carry `output_text` parts (prior turns in a
  // multi-turn conversation). Map them to AI SDK assistant text parts.
  if (role === 'assistant') {
    const content = (message.content as ResponsesInputPart[]).map(
      (part, partIndex): Exclude<AssistantModelMessage['content'], string>[number] => {
        const path = `input[${messageIndex}].content[${partIndex}]`;
        if (part.type === 'output_text' || part.type === 'input_text') {
          return { type: 'text', text: part.text ?? '' };
        }
        reject(`assistant content part type "${part.type}"`, `${path}.type`);
      },
    );
    return { role: 'assistant', content };
  }

  const content = (message.content as ResponsesInputPart[]).map(
    (part, partIndex): Exclude<UserModelMessage['content'], string>[number] => {
      const path = `input[${messageIndex}].content[${partIndex}]`;
      switch (part.type) {
        case 'input_text':
          return { type: 'text', text: part.text ?? '' };
        case 'input_image': {
          if (part.file_id) {
            reject('provider image file references', `${path}.file_id`);
          }
          if (!part.image_url) {
            reject('missing image_url', `${path}.image_url`);
          }
          return {
            type: 'file',
            mediaType: 'image/*',
            data: {
              type: 'url',
              url: parseUrl(part.image_url, `${path}.image_url`),
            },
          };
        }
        case 'input_file': {
          if (part.file_id) {
            reject('provider file references', `${path}.file_id`);
          }
          if (part.file_url)
            return {
              type: 'file',
              mediaType: 'application/pdf',
              data: {
                type: 'url',
                url: parseUrl(part.file_url, `${path}.file_url`),
              },
            };
          if (!part.file_data) {
            reject('missing file_data', `${path}.file_data`);
          }
          const dataUrl = parseDataUrl(part.file_data);
          if (!dataUrl) {
            reject('non-data-URL file_data', `${path}.file_data`);
          }
          return {
            type: 'file',
            mediaType: dataUrl.mediaType,
            filename: part.filename ?? undefined,
            data: { type: 'data', data: dataUrl.data },
          };
        }
        case 'input_audio': {
          if (!part.input_audio) {
            reject('missing input_audio', `${path}.input_audio`);
          }
          const mediaType = AUDIO_FORMAT_MIME[part.input_audio.format];
          if (!mediaType) {
            reject(`audio format "${part.input_audio.format}"`, `${path}.input_audio.format`);
          }
          return {
            type: 'file',
            mediaType,
            data: { type: 'data', data: part.input_audio.data },
          };
        }
        default:
          reject(`content part type "${part.type}"`, `${path}.type`);
      }
    },
  );

  return { role, content } as ModelMessage;
}

function parseToolArguments(value: string, param: string): unknown {
  if (value.trim().length === 0) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestValidationError({
      message: `Invalid JSON in function_call arguments: "${value}"`,
      param,
    });
  }
}

function reject(modality: string, param: string): never {
  throw new UnsupportedModalityError({ provider: 'openai', modality, param });
}

function parseUrl(value: string, param: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new RequestValidationError({
      message: `Invalid URL: "${value}"`,
      param,
    });
  }
}

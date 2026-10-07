import type { UserContent, UserModelMessage } from '@ai-sdk/provider-utils';

import { UnsupportedModalityError } from '../../../../errors/gatewayError.js';
import type { CacheControl } from '../../../../shared/types.js';
import { parseDataUrl } from '../../../../utils/parseDataUrl.js';
import type { OpenAIUserMessage } from '../types.js';

const AUDIO_FORMAT_MIME: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  opus: 'audio/opus',
  pcm16: 'audio/l16',
};

export function parseUserMessage(msg: OpenAIUserMessage, messageIndex: number): UserModelMessage {
  if (typeof msg.content === 'string') {
    const result: UserModelMessage = { role: 'user', content: msg.content };
    if (msg.cache_control) {
      result.providerOptions = { unknown: { cache_control: msg.cache_control } };
    }

    return result;
  }

  const content = msg.content.map((part, partIndex): Exclude<UserContent, string>[number] => {
    const path = `messages[${messageIndex}].content[${partIndex}]`;
    const cacheOpts = (part as { cache_control?: CacheControl }).cache_control;
    const providerOptions = cacheOpts ? { unknown: { cache_control: cacheOpts } } : undefined;

    switch (part.type) {
      case 'text': {
        return { type: 'text', text: part.text, providerOptions };
      }

      case 'image_url': {
        const dataUrl = parseDataUrl(part.image_url.url);
        if (!dataUrl) {
          throw new UnsupportedModalityError({
            provider: 'openai',
            modality: 'remote image URL',
            param: `${path}.image_url.url`,
          });
        }

        const detail = part.image_url.detail;

        return {
          type: 'file',
          mediaType: dataUrl.mediaType,
          data: { type: 'data', data: dataUrl.data },
          providerOptions: detail
            ? { unknown: { ...providerOptions?.unknown, image_detail: detail } }
            : providerOptions,
        };
      }

      case 'input_audio': {
        const mediaType = AUDIO_FORMAT_MIME[part.input_audio.format];
        if (!mediaType) {
          throw new UnsupportedModalityError({
            provider: 'openai',
            modality: `audio format "${part.input_audio.format}"`,
            param: `${path}.input_audio.format`,
          });
        }

        return {
          type: 'file',
          mediaType,
          data: { type: 'data', data: part.input_audio.data },
          providerOptions,
        };
      }

      case 'file': {
        if (!part.file.file_data) {
          throw new UnsupportedModalityError({
            provider: 'openai',
            modality: '`file_id` provider references',
            param: `${path}.file.file_id`,
          });
        }

        const dataUrl = parseDataUrl(part.file.file_data);
        if (!dataUrl) {
          throw new UnsupportedModalityError({
            provider: 'openai',
            modality: 'non-data-URL file_data',
            param: `${path}.file.file_data`,
          });
        }

        return {
          type: 'file',
          mediaType: dataUrl.mediaType,
          filename: part.file.filename ?? undefined,
          data: { type: 'data', data: dataUrl.data },
          providerOptions,
        };
      }

      default: {
        const unknown = part as { type: string };
        throw new UnsupportedModalityError({
          provider: 'openai',
          modality: `content part type "${unknown.type}"`,
          param: `${path}.type`,
        });
      }
    }
  });

  const result: UserModelMessage = { role: 'user', content };
  if (msg.cache_control) {
    result.providerOptions = { unknown: { cache_control: msg.cache_control } };
  }

  return result;
}

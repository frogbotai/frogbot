import type { UserContent, UserModelMessage } from '@ai-sdk/provider-utils';
import { UnsupportedModalityError } from '../../../../errors/gatewayError.js';
import type { CacheControl } from '../../../../shared/types.js';
import type { OpenAIUserMessage } from '../types.js';
import { parseDataUrl } from '../../../../utils/parseDataUrl.js';

// OpenAI accepts these audio formats on `input_audio` parts. Per OpenAI
// docs as of 2026-06 the set is `wav | mp3 | flac | opus | pcm16`. The
// MIME mapping below is what the AI SDK and downstream providers expect.
const AUDIO_FORMAT_MIME: Record<string, string> = {
  wav:   'audio/wav',
  mp3:   'audio/mpeg',
  flac:  'audio/flac',
  opus:  'audio/opus',
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

      // Inline data URLs only. Remote URLs are rejected with a
      // clean 400 — we can't introspect the MIME without a HEAD request.
      // M1+ may add a download/sniff path if a real use case appears.
      case 'image_url': {
        const dataUrl = parseDataUrl(part.image_url.url);
        if (!dataUrl) {
          throw new UnsupportedModalityError({
            provider: 'openai',
            modality: 'remote image URL',
            param: `${path}.image_url.url`,
          });
        }
        // G55: forward `detail` (low/high/auto) via the `unknown` namespace —
        // forwardLanguageParams remaps it to `<provider>.imageDetail`, the key
        // the AI SDK's OpenAI converter reads for outbound `image_url.detail`.
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

      // OpenAI ships two file shapes: inline `file_data` (data URL) and
      // server-side `file_id` reference. We support `file_data` for PDFs;
      // `file_id` is a future provider-reference TODO.
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

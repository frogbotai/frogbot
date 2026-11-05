import type { ModelMessage, UIMessage } from 'ai';
import { isToolUIPart } from 'ai';

const CHARS_PER_TOKEN = 4;
const IMAGE_TOKENS = 1_500;
const PDF_TOKENS = 2_000;

export function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / CHARS_PER_TOKEN));
}

export function estimateUIMessages(messages: readonly Pick<UIMessage, 'parts'>[]): number {
  return messages.reduce(
    (sum, message) => sum + message.parts.reduce((total, part) => total + estimateUIPart(part), 0),
    0,
  );
}

export function estimateModelMessages(messages: readonly ModelMessage[]): number {
  return messages.reduce((sum, message) => {
    if (typeof message.content === 'string') return sum + estimateTokens(message.content);

    return (
      sum + message.content.reduce((total, part) => total + estimateModelPart(part as ModelPart), 0)
    );
  }, 0);
}

type UIPart = UIMessage['parts'][number];

function estimateUIPart(part: UIPart): number {
  if (part.type === 'text' || part.type === 'reasoning') return estimateTokens(part.text);

  if (part.type === 'file') return estimateMedia(part.mediaType);

  if (isToolUIPart(part)) {
    return estimateTokens(
      `${part.type}${json(part.input)}${'output' in part ? json(part.output) : ''}${
        'errorText' in part ? (part.errorText ?? '') : ''
      }`,
    );
  }

  if (part.type === 'data-compaction') return 0;

  const { data, mediaType } = part as { data?: unknown; mediaType?: unknown };

  if (typeof mediaType === 'string') return estimateMedia(mediaType);

  return part.type.startsWith('data-') ? estimateTokens(json(data)) : 0;
}

type ModelPart = {
  type: string;
  text?: string;
  mediaType?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
};

function estimateModelPart(part: ModelPart): number {
  if (part.type === 'text' || part.type === 'reasoning') return estimateTokens(part.text ?? '');

  if (part.type === 'image') return IMAGE_TOKENS;

  if (part.type === 'file') return estimateMedia(part.mediaType ?? '');

  if (part.type === 'tool-call') return estimateTokens(`${part.toolName ?? ''}${json(part.input)}`);

  if (part.type === 'tool-result') return estimateTokens(json(part.output));

  return 0;
}

function estimateMedia(mediaType: string): number {
  const type = mediaType.toLowerCase();

  if (type.startsWith('image/')) return IMAGE_TOKENS;

  if (type === 'application/pdf') return PDF_TOKENS;

  return 0;
}

function json(value: unknown): string {
  if (value === undefined) return '';

  if (typeof value === 'string') return value;

  return JSON.stringify(value) ?? '';
}

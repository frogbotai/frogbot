import type { UIMessage } from 'ai';
import { validateUIMessages } from 'ai';
import { z } from 'zod';

const fileReferenceSchema = z
  .object({
    type: z.literal('file-reference'),
    id: z.union([z.string(), z.number()]),
    filename: z.string(),
    mediaType: z.string(),
    origin: z.literal('paste').optional(),
  })
  .strict();

export async function validateChatMessages(
  messages: unknown[],
  tools?: Parameters<typeof validateUIMessages<UIMessage>>[0]['tools'],
): Promise<UIMessage[]> {
  const references = messages.map((message) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('parts' in message) ||
      !Array.isArray(message.parts)
    ) {
      return [];
    }

    return message.parts.map((part) =>
      part && typeof part === 'object' && 'type' in part && part.type === 'file-reference'
        ? fileReferenceSchema.parse(part)
        : undefined,
    );
  });

  const filtered = messages.map((message, index) => {
    if (
      !message ||
      typeof message !== 'object' ||
      !('parts' in message) ||
      !Array.isArray(message.parts)
    ) {
      return message;
    }

    return {
      ...message,
      parts: message.parts.map((part, partIndex) =>
        references[index]?.[partIndex] ? { type: 'text', text: '' } : part,
      ),
    };
  });

  const validated = await validateUIMessages({ messages: filtered, tools });

  return validated.map(
    (message, index) =>
      ({
        ...message,
        parts: message.parts.map((part, partIndex) => references[index]?.[partIndex] ?? part),
      }) as UIMessage,
  );
}

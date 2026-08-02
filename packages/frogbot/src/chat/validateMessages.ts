import type { UIMessage } from 'ai';
import { validateUIMessages } from 'ai';
import { z } from 'zod';

const fileReferenceSchema = z.object({ type: z.literal('file-reference'), id: z.union([z.string(), z.number()]), filename: z.string(), mediaType: z.string() }).strict();

export async function validateChatMessages(messages: unknown[], tools: never): Promise<UIMessage[]> {
  const references = messages.map((message) => {
    if (!message || typeof message !== 'object' || !('parts' in message) || !Array.isArray(message.parts)) return [];
    return message.parts.map((part) => part && typeof part === 'object' && 'type' in part && part.type === 'file-reference' ? fileReferenceSchema.parse(part) : undefined);
  });
  const filtered = messages.map((message, index) => {
    if (!message || typeof message !== 'object' || !('parts' in message) || !Array.isArray(message.parts)) return message;
    return { ...message, parts: message.parts.filter((_, partIndex) => !references[index]?.[partIndex]) };
  });
  const validated = await validateUIMessages({ messages: filtered, tools });
  return validated.map((message, index) => {
    let partIndex = 0;
    return { ...message, parts: references[index]?.map((reference) => reference ?? message.parts[partIndex++]!) ?? message.parts } as UIMessage;
  });
}

const MARKER = 'frogbot-question';

export type QuestionModalLocator = {
  threadId: string;
  messageId: string;
};

export function encodeQuestionModalMetadata({ threadId, messageId }: QuestionModalLocator): string {
  return JSON.stringify({ [MARKER]: 1, threadId, messageId });
}

export function decodeQuestionModalMetadata(value?: string): QuestionModalLocator | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);

    if (
      parsed &&
      typeof parsed === 'object' &&
      MARKER in parsed &&
      'threadId' in parsed &&
      'messageId' in parsed &&
      typeof parsed.threadId === 'string' &&
      typeof parsed.messageId === 'string'
    ) {
      return { threadId: parsed.threadId, messageId: parsed.messageId };
    }
  } catch {
    return null;
  }

  return null;
}

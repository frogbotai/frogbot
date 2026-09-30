export type TextMessage = {
  role: string;
  parts: Array<Record<string, unknown>>;
};

function truncate(text: string, maxLength: number): string {
  const cut = text.slice(0, maxLength - 1);
  const whole = /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;

  return `${whole.trimEnd()}…`;
}

export function firstUserText(messages: TextMessage[], maxLength?: number): string | undefined {
  for (const message of messages) {
    if (message.role !== 'user') continue;

    for (const part of message.parts) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        const text = part.text.trim();

        return maxLength && text.length > maxLength ? truncate(text, maxLength) : text;
      }
    }
  }
}

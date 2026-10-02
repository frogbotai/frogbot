const MAX_CHARS = 60_000;

const counts = new Intl.NumberFormat('en-US');

export function formatCount(count: number): string {
  return counts.format(count);
}

function cutIndex(text: string): number {
  const lineBreak = text.lastIndexOf('\n', MAX_CHARS);

  if (lineBreak > 0) return lineBreak;

  const code = text.charCodeAt(MAX_CHARS - 1);

  return code >= 0xd800 && code <= 0xdbff ? MAX_CHARS - 1 : MAX_CHARS;
}

export function limitText({ text, filename }: { text: string; filename: string }): string {
  if (text.length <= MAX_CHARS) return text;

  const kept = text.slice(0, cutIndex(text));
  const note = `[${filename}: showing the first ${formatCount(kept.length)} of ${formatCount(text.length)} characters]`;

  return `${kept}\n${note}`;
}

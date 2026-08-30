import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const markdownPatterns = [
  /\*\*[^*]+\*\*/,
  /\*[^*]+\*/,
  /^#+\s/m,
  /^[\s]*[-*+]\s/m,
  /^\s*\d+\.\s/m,
  /`[^`]+`/,
  /```[\s\S]*?```/,
  /\[([^\]]+)]\(([^)]+)\)/,
];

function copyWithTextarea(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

export async function copyMarkdown(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return copyWithTextarea(text);
    if (
      !markdownPatterns.some((pattern) => pattern.test(text)) ||
      typeof ClipboardItem === 'undefined'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([markdown.render(text)], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithTextarea(text);
    }
  }
}

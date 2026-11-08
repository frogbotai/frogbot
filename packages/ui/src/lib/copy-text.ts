/** Copies `text` with a hidden textarea, for browsers without the async clipboard. */
export function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();

    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

/** Copies `text` to the clipboard as plain text. Resolves `false` when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return copyWithTextarea(text);
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    try {
      return copyWithTextarea(text);
    } catch {
      return false;
    }
  }
}

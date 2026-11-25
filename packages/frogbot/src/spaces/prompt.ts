import type { RunSpace } from './run.js';

/** The Space section of the system prompt. Stable for a Space, so the prompt stays cacheable. */
export function renderSpacePrompt({ title, instructions, files }: RunSpace): string {
  const lines = [`## Space: ${title}`, '', 'This chat belongs to this Space.'];

  if (instructions) lines.push('', instructions);

  if (files.length > 0) {
    lines.push(
      '',
      'Files in this Space. Read one with `space_file_read` when it would help:',
      ...files.map((filename) => `- ${filename}`),
    );
  }

  return lines.join('\n');
}

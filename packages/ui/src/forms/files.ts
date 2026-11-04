import type { FormQuestion } from './types.js';

const MiB = 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < MiB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return `${Number((bytes / MiB).toFixed(1))} MB`;
}

function matchesType(type: string, patterns: string[]): boolean {
  const actual = type.toLowerCase();

  return patterns.some((pattern) => {
    const expected = pattern.toLowerCase();

    return expected.endsWith('/*') ? actual.startsWith(expected.slice(0, -1)) : actual === expected;
  });
}

/** What's wrong with the chosen files, checked as the server will, or nothing. */
export function fileProblem(question: FormQuestion, files: File[]): string | undefined {
  const maxFiles = question.maxFiles ?? 1;

  if (files.length > maxFiles) {
    return maxFiles === 1 ? 'Attach one file.' : `Attach up to ${maxFiles} files.`;
  }

  for (const file of files) {
    if (question.maxFileSize !== undefined && file.size > question.maxFileSize) {
      return `"${file.name}" is larger than ${formatBytes(question.maxFileSize)}.`;
    }

    if (question.mimeTypes?.length && !matchesType(file.type, question.mimeTypes)) {
      return `"${file.name}" isn't an accepted type (${question.mimeTypes.join(', ')}).`;
    }
  }
}

/** The limits shown under a file input, like "Up to 3 files, 10 MB each." */
export function fileHint(question: FormQuestion): string {
  const maxFiles = question.maxFiles ?? 1;
  const count = maxFiles === 1 ? 'One file' : `Up to ${maxFiles} files`;
  const size = question.maxFileSize === undefined ? '' : `, ${formatBytes(question.maxFileSize)}`;

  return `${count}${size}${maxFiles > 1 && size ? ' each' : ''}.`;
}

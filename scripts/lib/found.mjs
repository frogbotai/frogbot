const VITEST_OUTPUT = /\bTest Files\s|\bstderr \|/;

const ROW = /^(\S+(?: \S+)*?) · ([a-z0-9][a-z0-9-]*) · (.+)$/;

export const FINDING_REPOS = ['frogbot', 'platform', 'process'];

export function findingProblem(text) {
  const lines = text.trim().split('\n');

  if (lines[0] === '') return 'no row on stdin';
  if (lines.length > 1) return `the row has ${lines.length} lines; write one`;

  if (text.includes('\u001b')) {
    return 'the row has terminal escape codes, so it looks like captured output';
  }

  if (VITEST_OUTPUT.test(text)) return 'the row has vitest output ("Test Files" or "stderr |")';

  return null;
}

export function parseFinding(text) {
  const match = ROW.exec(text.trim());

  if (!match) return null;

  const [, kind, area, title] = match;

  return { kind, area, title };
}

export function findingIssue({ kind, area, title }, source) {
  return {
    title,
    body: `Kind: ${kind}${source ? `\n\nSource: ${source}` : ''}`,
    labels: ['found', `area:${area}`],
  };
}

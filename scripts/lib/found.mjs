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

const IDEA_KINDS = new Set(['idea', 'gap', 'feature']);

const RED_ON_MAIN = /pre-existing|failing on main|red on main/i;

/** Why a finding can't be filed as asked, or null. */
export function findingRefusal({ kind }, { source, noticed = false }) {
  if (RED_ON_MAIN.test(kind)) {
    return 'A test or check failing on main is fixed in its own small PR, not filed.';
  }

  if (!noticed && !IDEA_KINDS.has(kind) && !source) {
    return 'A found issue needs --source: the command that shows it failing. Without one, file it with --noticed.';
  }

  return null;
}

/** `enhancement` for ideas, `noticed` when asked, else `found`. */
export function findingIssue({ kind, area, title }, source, { noticed = false } = {}) {
  const label = IDEA_KINDS.has(kind) ? 'enhancement' : noticed ? 'noticed' : 'found';

  return {
    title,
    body: `Kind: ${kind}${source ? `\n\nSource: ${source}` : ''}`,
    labels: [label, `area:${area}`],
  };
}

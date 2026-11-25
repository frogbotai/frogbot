export const FINDING_REPOS: string[];

export function findingProblem(text: string): string | null;

export function parseFinding(text: string): { kind: string; area: string; title: string } | null;

export function findingRefusal(
  finding: { kind: string },
  options: { source?: string; noticed?: boolean },
): string | null;

export function findingIssue(
  finding: { kind: string; area: string; title: string },
  source?: string,
  options?: { noticed?: boolean },
): { title: string; body: string; labels: string[] };

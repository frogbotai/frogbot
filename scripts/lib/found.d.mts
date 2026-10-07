export function findingIds(text: string): number[];

export function nextFindingId(texts: string[]): string;

export function findingLine(options: { id: string; text: string; source?: string }): string;

export function findingProblem(text: string): string | null;

export function appendFinding(options: {
  file: string;
  archive?: string;
  text: string;
  source?: string;
}): { id: string; line: string };

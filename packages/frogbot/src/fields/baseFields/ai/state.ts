export type AIFieldStatus = 'pending' | 'done' | 'error' | 'manual';

export type AIKind = { type: 'ai'; inputs: string[]; prompt: string; model?: string };

export function aiFieldPaths(name: string): { status: string; error: string } {
  return { status: `_${name}_status`, error: `_${name}_error` };
}

export function isAIFieldInputSet(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;

  return !(Array.isArray(value) && value.length === 0);
}

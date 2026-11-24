export function pnpmMajor(dir: string, env?: NodeJS.ProcessEnv): number;

export function workspaceWithOverrides(yaml: string, overrides: Record<string, string>): string;

/** Writes pnpm overrides where the pnpm that runs in `dir` reads them. */
export function writeOverrides(
  dir: string,
  overrides: Record<string, string>,
  options?: { env?: NodeJS.ProcessEnv; major?: number },
): void;

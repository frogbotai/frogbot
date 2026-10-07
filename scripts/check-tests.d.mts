export type TestProblem = { file: string; line?: number; message: string };

export type VitestProject = { name: string; include: string[]; exclude: string[] };

export type PlaywrightPattern = string | RegExp | Array<string | RegExp>;

export type PlaywrightProject = {
  name: string;
  testDir: string;
  testMatch: PlaywrightPattern;
  testIgnore: PlaywrightPattern;
};

export const READ_ONLY: Record<string, string>;

export function sourceTests(files: string[]): TestProblem[];

export function playwrightMatcher(patterns: PlaywrightPattern): (file: string) => boolean;

export function vitestProjects(config: object): VitestProject[];

export function playwrightProjects(config: object, configFile: string): PlaywrightProject[];

export function unassignedSpecs(options: {
  files: string[];
  vitest: VitestProject[];
  playwright: PlaywrightProject[];
  root?: string;
}): TestProblem[];

export function unresetSuites(options: {
  files: string[];
  read: (file: string) => string | undefined;
  readOnly?: Record<string, string>;
}): TestProblem[];

export function repoScratchDirs(options: { file: string; source: string }): TestProblem[];

export function loadConfig(file: string): Promise<unknown>;

export function resolveExtensionless(): void;

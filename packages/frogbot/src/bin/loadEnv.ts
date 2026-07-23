import nextEnvImport from '@next/env';

const { loadEnvConfig } = nextEnvImport;

export function loadEnv(cwd = process.cwd()): void {
  loadEnvConfig(cwd, true);
}

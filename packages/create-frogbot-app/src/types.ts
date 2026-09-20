import type { TemplateRegistryEntry } from './templates.js';

export type AgentTarget = 'claude' | 'codex' | 'copilot' | 'cursor' | 'gemini' | 'opencode';
export type AIProvider = 'anthropic' | 'bedrock' | 'google' | 'none' | 'openai' | 'zen';
export type Database = 'mongodb' | 'postgres' | 'sqlite';
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

export interface ScaffoldPlan {
  agents: AgentTarget[];
  ai: AIProvider;
  database: Database;
  dest: string;
  git: boolean;
  install: boolean;
  packageManager: PackageManager;
  projectName: string;
  template: TemplateRegistryEntry;
}

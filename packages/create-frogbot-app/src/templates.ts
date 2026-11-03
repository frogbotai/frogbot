import { CliError } from './lib/errors.js';
import type { Database } from './types.js';

export interface TemplateRegistryEntry {
  /** Files and folders only used with an AI provider, relative to the app root; `--ai none` deletes them. */
  aiPaths: string[];
  defaultDatabase: Database;
  description: string;
  dir: string;
  name: string;
  supportedDatabases: Database[];
}

export const TEMPLATES: TemplateRegistryEntry[] = [
  {
    aiPaths: ['src/agents'],
    defaultDatabase: 'sqlite',
    description: 'A minimal FrogBot app with authentication, agents, and the admin panel.',
    dir: 'blank',
    name: 'blank',
    supportedDatabases: ['sqlite', 'postgres', 'mongodb'],
  },
  {
    aiPaths: ['src/agents'],
    defaultDatabase: 'sqlite',
    description: 'Projects and tasks on a board, with sample data to seed from the dashboard.',
    dir: 'projects',
    name: 'projects',
    supportedDatabases: ['sqlite', 'postgres', 'mongodb'],
  },
];

export function getTemplate(name: string): TemplateRegistryEntry {
  const template = TEMPLATES.find((entry) => entry.name === name);

  if (!template) {
    throw new CliError(
      `Unknown template "${name}". Valid templates: ${TEMPLATES.map(({ name }) => name).join(', ')}.`,
    );
  }

  return template;
}

import type { Database } from './types.js';

export interface TemplateRegistryEntry {
  defaultDatabase: Database;
  description: string;
  dir: string;
  name: string;
  supportedDatabases: Database[];
}

export const TEMPLATES: TemplateRegistryEntry[] = [
  {
    defaultDatabase: 'sqlite',
    description: 'A minimal FrogBot app with authentication, agents, and the admin panel.',
    dir: 'blank',
    name: 'blank',
    supportedDatabases: ['sqlite', 'postgres', 'mongodb'],
  },
];

export function getTemplate(name: string): TemplateRegistryEntry {
  const template = TEMPLATES.find((entry) => entry.name === name);

  if (!template) {
    throw new Error(
      `Unknown template "${name}". Valid templates: ${TEMPLATES.map(({ name }) => name).join(', ')}.`,
    );
  }

  return template;
}

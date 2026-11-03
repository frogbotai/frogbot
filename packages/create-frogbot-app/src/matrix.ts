import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scaffold } from './index.js';
import type { TemplateRegistryEntry } from './templates.js';
import type { AIProvider } from './types.js';

const PROVIDERS: AIProvider[] = ['openai', 'none'];

/**
 * Scaffolds every template with each supported database, with and without AI, into a temp
 * folder. Throws on the first failure, naming the template, database and provider.
 */
export function scaffoldMatrix(templates: TemplateRegistryEntry[], templatesDir: string): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-matrix-'));

  try {
    for (const template of templates) {
      for (const database of template.supportedDatabases) {
        for (const ai of PROVIDERS) {
          const name = `${template.dir}-${database}-${ai}`;

          try {
            scaffold({
              ai,
              database,
              dest: path.join(root, name),
              packageManager: 'npm',
              projectName: name,
              template,
              templateDir: path.join(templatesDir, template.dir),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`templates/${template.dir} × ${database} × ${ai}: ${message}`, {
              cause: error,
            });
          }
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

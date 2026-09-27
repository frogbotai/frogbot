import fs from 'node:fs';
import path from 'node:path';

import type { Database } from '../types.js';

export type DatabaseDependencies = Partial<Record<Database, Record<string, string>>>;

export function applyPackageJson(
  dest: string,
  projectName: string,
  database: Database,
  version: string,
  databaseDependencies: DatabaseDependencies = {},
): void {
  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    dependencies: Record<string, string>;
    name: string;
  };

  pkg.name = projectName;

  if (database !== 'sqlite') {
    delete pkg.dependencies['@frogbotai/db-sqlite'];
    delete pkg.dependencies.libsql;

    pkg.dependencies[`@frogbotai/db-${database}`] = `^${version}`;
  }

  if (database === 'mongodb') delete pkg.dependencies['drizzle-kit'];

  // The adapter's own runtime dependencies (e.g. @payloadcms/db-mongodb) must
  // resolve from the app root: Next dev can load an externalized adapter via
  // its node_modules symlink instead of its real path.
  Object.assign(pkg.dependencies, databaseDependencies[database]);

  pkg.dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );

  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

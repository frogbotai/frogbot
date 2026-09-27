import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const { CONFIG_ANCHORS, ENV_ANCHORS, PACKAGE_DEPENDENCY_ANCHORS } =
  await import('../dist/lib/anchors.js');
const { TEMPLATES } = await import('../dist/templates.js');

const skip = new Set(['node_modules', 'dist', '.next', '.env', '.env.local', 'frogbot-types.ts']);

const resolveVersion = (name) => {
  const dir = name === 'frogbot' ? 'frogbot' : name.replace('@frogbotai/', '');
  const depPkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', dir, 'package.json'), 'utf8'),
  );
  return `^${depPkg.version}`;
};

for (const template of TEMPLATES) {
  const src = path.join(repoRoot, 'templates', template.dir);
  const dest = path.join(packageRoot, 'dist', 'templates', template.dir);

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (entry) => {
      const base = path.basename(entry);
      return (
        !skip.has(base) &&
        !/\.db(-journal|-shm|-wal)?$/.test(base) &&
        !base.endsWith('.tsbuildinfo')
      );
    },
  });

  fs.renameSync(path.join(dest, '.gitignore'), path.join(dest, 'gitignore'));

  const config = fs.readFileSync(path.join(dest, 'src', 'frogbot.config.ts'), 'utf8');

  for (const [name, anchor] of Object.entries(CONFIG_ANCHORS)) {
    if (config.split(anchor).length !== 2) {
      throw new Error(`Expected exactly one ${name} anchor in templates/${template.dir}.`);
    }
  }

  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  for (const dependency of PACKAGE_DEPENDENCY_ANCHORS) {
    if (typeof pkg.dependencies?.[dependency] !== 'string') {
      throw new Error(
        `Expected package dependency ${dependency} anchor in templates/${template.dir}.`,
      );
    }
  }

  const env = fs.readFileSync(path.join(dest, '.env.example'), 'utf8');

  for (const anchor of ENV_ANCHORS) {
    if (env.split(anchor).length !== 2) {
      throw new Error(`Expected exactly one environment anchor in templates/${template.dir}.`);
    }
  }

  for (const deps of [pkg.dependencies, pkg.devDependencies]) {
    if (!deps) continue;

    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && version.startsWith('workspace:')) {
        deps[name] = resolveVersion(name);
      }
    }
  }

  delete pkg.private;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  console.log(
    `[create-frogbot-app] packed templates/${template.dir} -> dist/templates/${template.dir}`,
  );
}

// Generated apps declare each FrogBot database adapter's runtime dependencies
// directly (at the adapter's exact versions, so pnpm dedupes them). Next dev can
// load an externalized adapter through its node_modules symlink rather than its
// real path; without a direct dependency, `@payloadcms/db-*` is then unresolvable.
const { DATABASE_CHOICES } = await import('../dist/lib/db.js');
const databaseDependencies = {};

for (const database of DATABASE_CHOICES) {
  const adapter = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', `db-${database}`, 'package.json'), 'utf8'),
  );

  databaseDependencies[database] = Object.fromEntries(
    Object.entries(adapter.dependencies ?? {}).filter(
      ([, version]) => !version.startsWith('workspace:'),
    ),
  );
}

fs.writeFileSync(
  path.join(packageRoot, 'dist', 'database-dependencies.json'),
  `${JSON.stringify(databaseDependencies, null, 2)}\n`,
);
console.log('[create-frogbot-app] wrote dist/database-dependencies.json');

const skillSource = path.join(repoRoot, 'skills', 'frogbot');
const skillDest = path.join(packageRoot, 'dist', 'skills', 'frogbot');

fs.rmSync(skillDest, { recursive: true, force: true });

if (fs.existsSync(skillSource)) {
  fs.cpSync(skillSource, skillDest, { recursive: true });
  console.log('[create-frogbot-app] packed skills/frogbot -> dist/skills/frogbot');
} else {
  console.log('[create-frogbot-app] skill not found at skills/frogbot; skipping');
}

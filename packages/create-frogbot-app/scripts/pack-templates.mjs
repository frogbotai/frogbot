import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

const templateName = 'blank';
const src = path.join(repoRoot, 'templates', templateName);
const dest = path.join(packageRoot, 'dist', 'templates', templateName);

const skip = new Set(['node_modules', 'dist', '.next', '.env', '.env.local', 'frogbot-types.ts']);

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (entry) => {
    const base = path.basename(entry);
    return !skip.has(base) && !base.startsWith('frogbot.db') && !base.endsWith('.tsbuildinfo');
  },
});

fs.renameSync(path.join(dest, '.gitignore'), path.join(dest, 'gitignore'));

const pkgPath = path.join(dest, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const resolveVersion = (name) => {
  const dir = name === 'frogbot' ? 'frogbot' : name.replace('@frogbotai/', '');
  const depPkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', dir, 'package.json'), 'utf8'),
  );
  return `^${depPkg.version}`;
};

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

console.log(`[create-frogbot-app] packed templates/${templateName} -> dist/templates/${templateName}`);

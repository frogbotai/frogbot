import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, 'packages/ui');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frogbot-ui-'));
const appRoot = path.join(temporaryRoot, 'app');
const extractedRoot = path.join(temporaryRoot, 'package');
const subpaths = ['.', './icons', './theme', './chat', './chat/tools', './chat/artifacts'];

const run = (command, args, cwd = repoRoot) => {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
};

try {
  run('pnpm', ['--filter', '@frogbotai/ui', 'build']);
  run('pnpm', ['pack', '--pack-destination', temporaryRoot], packageRoot);

  const tarball = fs.readdirSync(temporaryRoot).find((file) => file.endsWith('.tgz'));
  assert.ok(tarball);
  run('tar', ['-xzf', path.join(temporaryRoot, tarball), '-C', temporaryRoot]);

  const packageJSON = JSON.parse(fs.readFileSync(path.join(extractedRoot, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(packageJSON.exports).sort(), [...subpaths, './styles.css'].sort());

  for (const subpath of subpaths) {
    const entry = packageJSON.exports[subpath];
    assert.equal(typeof entry, 'object');
    assert.ok(fs.statSync(path.join(extractedRoot, entry.import)).isFile());
    assert.ok(fs.statSync(path.join(extractedRoot, entry.types)).isFile());
  }

  const cssFiles = fs.readdirSync(extractedRoot, { recursive: true })
    .filter((file) => file.endsWith('.css'));
  assert.deepEqual(cssFiles, ['dist/styles.css']);
  assert.ok(fs.statSync(path.join(extractedRoot, 'dist/styles.css')).size > 0);
  const css = fs.readFileSync(path.join(extractedRoot, 'dist/styles.css'), 'utf8');
  assert.match(css, /\.text-frogbot-ui/);
  assert.match(css, /var\(--frogbot-ui-foreground\)/);

  const clientEntry = fs.readFileSync(path.join(extractedRoot, 'dist/placeholder.js'), 'utf8');
  assert.equal(clientEntry.split('\n')[0], "'use client';");

  fs.mkdirSync(path.join(appRoot, 'src'), { recursive: true });
  fs.copyFileSync(path.join(temporaryRoot, tarball), path.join(appRoot, tarball));
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({
    name: 'frogbot-ui-vite-smoke',
    private: true,
    type: 'module',
    scripts: { build: 'tsc --noEmit && vite build' },
    dependencies: {
      '@frogbotai/ui': `./${tarball}`,
      '@types/react': '19.2.14',
      '@types/react-dom': '19.2.3',
      react: '19.2.6',
      'react-dom': '19.2.6',
      typescript: '5.6.2',
      vite: '^6.0.0',
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(appRoot, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');
  fs.writeFileSync(path.join(appRoot, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      jsx: 'react-jsx',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['src'],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(appRoot, 'src/main.tsx'), `import { Placeholder } from '@frogbotai/ui'
import * as artifacts from '@frogbotai/ui/chat/artifacts'
import * as chat from '@frogbotai/ui/chat'
import * as icons from '@frogbotai/ui/icons'
import * as theme from '@frogbotai/ui/theme'
import * as tools from '@frogbotai/ui/chat/tools'
import '@frogbotai/ui/styles.css'
import { createRoot } from 'react-dom/client'

void [artifacts, chat, icons, theme, tools]
createRoot(document.getElementById('root')!).render(<Placeholder />)
`);

  run('pnpm', ['install', '--ignore-scripts'], appRoot);
  run('pnpm', ['build'], appRoot);

  const bundle = fs.readdirSync(path.join(appRoot, 'dist/assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(appRoot, 'dist/assets', file), 'utf8'))
    .join('\n');
  assert.match(bundle, /FrogBot UI/);
  for (const forbidden of ['process.env', '@payloadcms/', 'next/']) {
    assert.ok(!bundle.includes(forbidden));
  }

  console.log('[test-ui-package] Packed exports, types, CSS, client directive, and Vite consumption passed.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

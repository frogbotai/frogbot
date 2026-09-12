import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const nextRoot = path.resolve('templates/blank/.next');
const registryRouteRoot = path.resolve(
  'templates/blank/src/app/(frogbot)/icon-registry-resolution',
);
const registryRoute = path.join(registryRouteRoot, 'page.tsx');
const importMap = path.resolve('templates/blank/src/app/(frogbot)/importMap.js');
const originalImportMap = fs.readFileSync(importMap);

fs.rmSync(nextRoot, { recursive: true, force: true });
fs.mkdirSync(registryRouteRoot);
fs.writeFileSync(
  registryRoute,
  `import { iconNames } from '@frogbotai/ui/icons/registry';

export default function IconRegistryResolutionPage() {
  return <div>{iconNames.includes('check') ? 'icon registry resolved' : 'missing icon'}</div>;
}
`,
);

try {
  execFileSync('pnpm', ['--filter', 'blank...', 'build'], { stdio: 'inherit' });

  const rootPage = path.join(nextRoot, 'server/app/(frogbot)/[[...segments]]/page.js');
  const registryPage = path.join(nextRoot, 'server/app/(frogbot)/icon-registry-resolution/page.js');
  assert.ok(fs.existsSync(rootPage));
  assert.match(fs.readFileSync(registryPage, 'utf8'), /icon registry resolved/);

  const staticRoot = path.join(nextRoot, 'static');
  const staticFiles = fs.readdirSync(staticRoot, { recursive: true });
  const css = staticFiles
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(staticRoot, file), 'utf8'))
    .join('\n');
  assert.ok(css.length > 0);
  assert.match(css, /\.fb-button/);
  assert.match(css, /var\(--theme-base-/);
  assert.match(css, /data-fb-theme/);
  assert.match(css, /body:has\(\.frogbot-nav-shell\) \.app-header__mobile-nav-toggler/);
  assert.match(css, /\.frogbot-mobile-nav-toggle/);
  assert.match(css, /\.frogbot-nav-backdrop/);
  for (const state of ['desktop-nav-closed', 'mobile-nav-open', 'mobile-nav-closed']) {
    assert.match(css, new RegExp(`\\.frogbot-nav-shell\\[data-nav-state=${state}\\]`));
  }
  assert.doesNotMatch(css, /\.template-default[^{]*\{[^}]*!important/);

  const bundles = staticFiles
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(staticRoot, file), 'utf8'))
    .join('\n');
  for (const forbidden of [
    '@payloadcms/',
    '@tauri-apps/',
    '@capacitor/',
    'FrogBot Pro',
    'firmware.ai',
  ]) {
    assert.ok(!bundles.includes(forbidden), `Next client bundle contains ${forbidden}`);
  }

  console.log('[test-ui-next] Next rendered the UI package with its compiled stylesheet.');
} finally {
  fs.rmSync(nextRoot, { recursive: true, force: true });
  fs.rmSync(registryRouteRoot, { recursive: true, force: true });
  fs.writeFileSync(importMap, originalImportMap);
}

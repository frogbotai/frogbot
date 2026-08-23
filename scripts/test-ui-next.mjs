import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const nextRoot = path.resolve('templates/blank/.next');
const registryRouteRoot = path.resolve('templates/blank/src/app/(app)/icon-registry-resolution');
const registryRoute = path.join(registryRouteRoot, 'page.tsx');
const importMap = path.resolve('templates/blank/src/app/(frogbot)/admin/importMap.js');
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
} finally {
  fs.rmSync(registryRouteRoot, { recursive: true, force: true });
  fs.writeFileSync(importMap, originalImportMap);
}

const html = fs.readFileSync(path.join(nextRoot, 'server/app/index.html'), 'utf8');

assert.match(html, /data-fb-ui=""/);
assert.match(html, /data-theme="system"/);
assert.match(html, /Loading chat/);
assert.match(html, /localStorage\.getItem/);

const registryHTML = fs.readFileSync(
  path.join(nextRoot, 'server/app/icon-registry-resolution.html'),
  'utf8',
);
assert.match(registryHTML, /icon registry resolved/);

const href = html.match(/href="(\/_next\/static\/css\/[^"?]+\.css)"/)?.[1];
assert.ok(href);

const css = fs.readFileSync(path.join(nextRoot, href.replace('/_next/', '')), 'utf8');
assert.ok(css.length > 0);
assert.match(css, /\.fb-button/);
assert.match(css, /var\(--color-background\)/);
assert.match(css, /data-fb-theme/);

const bundles = [...html.matchAll(/src="(\/_next\/static\/[^"?]+\.js)"/g)]
  .map((match) => fs.readFileSync(path.join(nextRoot, match[1].replace('/_next/', '')), 'utf8'))
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

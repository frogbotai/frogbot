import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nextRoot = path.resolve('templates/blank/.next');
const standaloneCopy = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'frogbot-standalone-')),
);
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
  execFileSync('pnpm', ['--filter', 'blank...', 'build'], {
    env: { ...process.env, NEXT_OUTPUT: 'standalone' },
    stdio: 'inherit',
  });

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

  const manifest = fs.readFileSync(
    path.join(nextRoot, 'server/app/(frogbot)/[[...segments]]/page_client-reference-manifest.js'),
    'utf8',
  );
  const layoutCss = manifest.match(/"[^"]*\/app\/\(frogbot\)\/layout":(\[[^\]]*\])/);
  assert.ok(layoutCss, 'No CSS entry for the admin layout');

  const layoutStyles = JSON.parse(layoutCss[1])
    .map((entry) => fs.readFileSync(path.join(nextRoot, entry.path), 'utf8'))
    .join('\n');
  const layerStatements = Array.from(layoutStyles.matchAll(/@layer ([^{;]+);/g), (match) =>
    match[1].replace(/\s+/g, ''),
  );
  assert.equal(layerStatements[0], 'payload-default,frogbot,payload');
  assert.ok(layerStatements.includes('payload-default,payload'));
  assert.match(css, /\.fb-button/);
  assert.match(css, /var\(--theme-base-/);
  assert.match(css, /data-fb-theme/);
  assert.match(css, /data-fb-ui-page/);
  assert.doesNotMatch(
    css,
    /--(text-(xs|sm|base|lg|xl|[2-5]xl)(--line-height)?|radius(-(sm|md|lg|xl))?|color-red-(500|600|700))\b/,
  );
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

  fs.cpSync(path.join(nextRoot, 'standalone'), standaloneCopy, {
    recursive: true,
    verbatimSymlinks: true,
  });

  const libsqlLoad = spawnSync(
    process.execPath,
    [
      '-e',
      `require('libsql');
console.log(JSON.stringify(Object.keys(require.cache).filter((file) => file.endsWith('.node'))));`,
    ],
    { cwd: path.join(standaloneCopy, 'templates/blank'), encoding: 'utf8' },
  );

  assert.equal(libsqlLoad.status, 0, `Standalone output cannot load libsql:\n${libsqlLoad.stderr}`);

  const nativeFiles = JSON.parse(libsqlLoad.stdout);

  assert.ok(nativeFiles.length > 0, 'Standalone output loaded libsql without a native binary');

  for (const file of nativeFiles) {
    assert.ok(
      file.startsWith(standaloneCopy),
      `libsql loaded ${file} from outside the standalone output`,
    );
  }

  console.log('[test-ui-next] Standalone output loaded the libsql native binary.');
} finally {
  fs.rmSync(standaloneCopy, { recursive: true, force: true });
  fs.rmSync(nextRoot, { recursive: true, force: true });
  fs.rmSync(registryRouteRoot, { recursive: true, force: true });
  fs.writeFileSync(importMap, originalImportMap);
}

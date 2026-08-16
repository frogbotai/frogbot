import path from 'node:path';

import { publishablePackages, readJSON, ROOT } from './lib/workspace.mjs';

const REGISTRY = process.env.npm_config_registry ?? 'https://registry.npmjs.org';
const CONCURRENCY = 10;

const target = readJSON(path.join(ROOT, 'package.json')).version;
const packages = publishablePackages();

async function status(pkg) {
  const url = `${REGISTRY.replace(/\/$/, '')}/${pkg.name.replace('/', '%2f')}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { ...pkg, state: 'error', detail: err.message };
  }
  if (res.status === 404) return { ...pkg, state: 'missing', detail: 'never published' };
  if (!res.ok) return { ...pkg, state: 'error', detail: `registry ${res.status}` };
  const json = await res.json();
  if (json.versions?.[pkg.version]) return { ...pkg, state: 'published' };
  return { ...pkg, state: 'missing', detail: `latest ${json['dist-tags']?.latest ?? 'none'}` };
}

const results = [];
for (let i = 0; i < packages.length; i += CONCURRENCY) {
  results.push(...(await Promise.all(packages.slice(i, i + CONCURRENCY).map(status))));
}

const stale = results.filter((r) => r.version !== target);
const missing = results.filter((r) => r.state === 'missing');
const errored = results.filter((r) => r.state === 'error');

console.log(`\nRelease status for ${target} (${REGISTRY})\n`);
for (const r of results) {
  if (r.state === 'published' && r.version === target) continue;
  const mark = r.state === 'published' ? 'ok' : r.state;
  console.log(
    `  ${mark.padEnd(10)} ${r.name.padEnd(36)} ${r.version}${r.detail ? `  (${r.detail})` : ''}`,
  );
}

console.log(
  `\n  ${results.length - missing.length - errored.length}/${results.length} published` +
    `${missing.length ? `, ${missing.length} missing` : ''}` +
    `${errored.length ? `, ${errored.length} unreachable` : ''}` +
    `${stale.length ? `, ${stale.length} not at ${target}` : ''}\n`,
);

if (stale.length) {
  console.log(`  Version drift — run \`pnpm bump <major|minor|patch>\` to realign.\n`);
}
if (missing.length) {
  console.log(`  Resume with \`pnpm release:resume\` — already-published versions are skipped.\n`);
}
if (missing.length || errored.length || stale.length) process.exit(1);

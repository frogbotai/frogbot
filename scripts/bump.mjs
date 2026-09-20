import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { consumerDirs, packageDirs, readJSON, ROOT } from './lib/workspace.mjs';

const BUMPS = ['major', 'minor', 'patch'];
const bump = process.argv[2];

if (!BUMPS.includes(bump)) {
  console.error(`Usage: pnpm bump <${BUMPS.join('|')}>`);
  process.exit(1);
}

function inc(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    throw new Error(`Cannot parse root package.json version "${version}" — expected x.y.z`);
  }

  const [major, minor, patch] = match.slice(1).map(Number);

  if (type === 'major') return `${major + 1}.0.0`;

  if (type === 'minor') return `${major}.${minor + 1}.0`;

  return `${major}.${minor}.${patch + 1}`;
}

function writeJSON(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readRequiredJSON(file) {
  let json;

  try {
    json = readJSON(file);
  } catch (error) {
    throw new Error(`${path.relative(ROOT, file)}: expected a readable JSON object`, {
      cause: error,
    });
  }

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`${path.relative(ROOT, file)}: expected a JSON object`);
  }

  return json;
}

function prepareSkill(file, version) {
  const rel = path.relative(ROOT, file);
  let text;

  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${rel}: cannot read required skill frontmatter`, { cause: error });
  }

  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);

  if (!frontmatter) {
    throw new Error(`${rel}: expected leading frontmatter enclosed by --- lines`);
  }

  const lines = [...frontmatter[1].matchAll(/^.*$/gm)];
  const metadata = lines.filter((line) => /^(?:metadata|['"]metadata['"])[ \t]*:/.test(line[0]));

  if (metadata.length !== 1 || !/^metadata:[ \t]*$/.test(metadata[0][0])) {
    throw new Error(`${rel}: expected exactly one top-level metadata: mapping`);
  }

  const start = lines.indexOf(metadata[0]) + 1;
  const end = lines.findIndex((line, index) => index >= start && /^\S/.test(line[0]));
  const block = lines.slice(start, end === -1 ? undefined : end);
  const versions = block.filter((line) =>
    /^[ \t]*(?:version|['"]version['"])[ \t]*:/.test(line[0]),
  );

  const scalar =
    versions.length === 1
      ? /^( {2}version:[ \t]+)(['"])(\d+\.\d+\.\d+)\2[ \t]*$/.exec(versions[0][0])
      : null;

  if (!scalar) {
    throw new Error(
      `${rel}: metadata.version must be exactly one two-space-indented quoted x.y.z scalar`,
    );
  }

  const offset = text.indexOf('\n') + 1 + versions[0].index + scalar[1].length + 1;

  return text.slice(0, offset) + version + text.slice(offset + scalar[3].length);
}

const rootPath = path.join(ROOT, 'package.json');
const root = readRequiredJSON(rootPath);
const current = root.version;

if (!current) throw new Error('Root package.json has no "version" field');

const next = inc(current, bump);

const dirs = packageDirs();

const workspaceNames = new Set();

for (const dir of dirs) {
  const pkgPath = path.join(dir, 'package.json');

  if (!existsSync(pkgPath)) continue;

  workspaceNames.add(readRequiredJSON(pkgPath).name);
}

const targets = [{ path: rootPath, json: root, name: root.name }];

for (const dir of [...dirs, ...consumerDirs()]) {
  const pkgPath = path.join(dir, 'package.json');

  if (!existsSync(pkgPath)) continue;

  const json = readRequiredJSON(pkgPath);

  targets.push({ path: pkgPath, json, name: json.name });
}

const packageCount = targets.length;
const pluginPath = path.join(ROOT, '.claude-plugin/plugin.json');
const plugin = readRequiredJSON(pluginPath);

if (plugin.name !== 'frogbot') {
  throw new Error('.claude-plugin/plugin.json: expected name "frogbot"');
}

targets.push({ path: pluginPath, json: plugin, name: '.claude-plugin/plugin.json' });

const marketplacePath = path.join(ROOT, '.claude-plugin/marketplace.json');
const marketplace = readRequiredJSON(marketplacePath);
const entries = Array.isArray(marketplace.plugins)
  ? marketplace.plugins.filter((entry) => entry?.name === 'frogbot')
  : [];

if (entries.length !== 1) {
  throw new Error(
    '.claude-plugin/marketplace.json: plugins must contain exactly one entry named "frogbot"',
  );
}

const marketplaceVersion = entries[0].version;

entries[0].version = next;

const skillPath = path.join(ROOT, 'skills/frogbot/SKILL.md');
const skill = prepareSkill(skillPath, next);

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function pinWorkspaceDeps(json) {
  const changed = [];

  for (const field of DEP_FIELDS) {
    const deps = json[field];

    if (!deps) continue;

    for (const [name, range] of Object.entries(deps)) {
      if (!workspaceNames.has(name)) continue;

      if (typeof range !== 'string' || range.startsWith('workspace:')) continue;

      if (range === next) continue;

      changed.push(`${name}@${range}->${next}`);
      deps[name] = next;
    }
  }

  return changed;
}

console.log(`\nBumping ${current} -> ${next} (${bump})\n`);

for (const { path: file, json, name } of targets) {
  const from = json.version;

  json.version = next;

  const deps = pinWorkspaceDeps(json);
  const rel = path.relative(ROOT, file);

  console.log(`  ${(name ?? rel).padEnd(36)} ${from} -> ${next}`);

  for (const d of deps) console.log(`      dep ${d}`);

  writeJSON(file, json);
}

writeJSON(marketplacePath, marketplace);
writeFileSync(skillPath, skill);

console.log(`  .claude-plugin/marketplace.json (frogbot) ${marketplaceVersion} -> ${next}`);
console.log(`  skills/frogbot/SKILL.md metadata.version -> ${next}`);
console.log(`\nDone. ${packageCount} package.json files and 3 distribution files updated.\n`);
console.log('Next: pnpm release');

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PINNED_ENV = { FROGBOT_DATABASE: 'sqlite', FROGBOT_SECRET: 'frogbot-generate-types' };

const PASSED_ENV = ['PATH', 'HOME', 'TMPDIR', 'SystemRoot'];

export function generateEnv(extra = {}) {
  const passed = PASSED_ENV.filter((name) => process.env[name] !== undefined).map((name) => [
    name,
    process.env[name],
  ]);

  return { ...Object.fromEntries(passed), ...PINNED_ENV, ...extra };
}

function unquote(text) {
  return text.trim().replace(/^(['"])(.*)\1$/, '$2');
}

export function catalog(yaml = readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8')) {
  const entries = {};
  const anchors = {};
  let inCatalog = false;

  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) {
      inCatalog = /^catalog:\s*$/.test(line);
      continue;
    }

    const match = inCatalog && /^\s+((?:'[^']+')|(?:"[^"]+")|[^\s:#]+):\s*(.+?)\s*$/.exec(line);

    if (!match) continue;

    const anchor = /^&(\S+)\s+(.+)$/.exec(match[2]);
    const alias = /^\*(\S+)$/.exec(match[2]);
    const value = anchor ? unquote(anchor[2]) : alias ? anchors[alias[1]] : unquote(match[2]);

    if (anchor) anchors[anchor[1]] = value;
    entries[unquote(match[1])] = value;
  }

  return entries;
}

export function catalogVersion(name) {
  const version = catalog()[name];

  if (!version) throw new Error(`pnpm-workspace.yaml has no catalog entry for ${name}`);

  return version;
}

export function readJSON(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function collectPackageDirs(baseDir) {
  const dirs = [];

  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const dir = path.join(baseDir, entry.name);
    if (existsSync(path.join(dir, 'package.json'))) {
      dirs.push(dir);
      continue;
    }

    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (!child.isDirectory() || child.name === 'node_modules') continue;
      const childDir = path.join(dir, child.name);
      if (existsSync(path.join(childDir, 'package.json'))) dirs.push(childDir);
    }
  }

  return dirs;
}

export function packageDirs() {
  return collectPackageDirs(path.join(ROOT, 'packages'));
}

export function consumerDirs() {
  const dirs = [];

  for (const group of ['examples', 'templates']) {
    const groupDir = path.join(ROOT, group);
    if (!existsSync(groupDir)) continue;

    for (const dir of readdirSync(groupDir)) dirs.push(path.join(groupDir, dir));
  }

  return dirs;
}

export function publishablePackages() {
  const pkgs = [];

  for (const dir of packageDirs()) {
    const pkgPath = path.join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const json = readJSON(pkgPath);
    if (json.private || !json.name || !json.version) continue;
    pkgs.push({ dir, name: json.name, version: json.version });
  }

  return pkgs.sort((a, b) => a.name.localeCompare(b.name));
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

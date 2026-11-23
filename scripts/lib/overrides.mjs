import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function pnpmMajor(dir, env = process.env) {
  const version = execFileSync('pnpm', ['--version'], { cwd: dir, env, encoding: 'utf8' }).trim();
  const major = Number.parseInt(version, 10);

  if (!Number.isInteger(major)) throw new Error(`Unexpected pnpm version in ${dir}: ${version}`);

  return major;
}

export function workspaceWithOverrides(yaml, overrides) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => /^overrides:\s*$/.test(line));
  let kept = lines;

  if (start !== -1) {
    let end = start + 1;

    while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;

    kept = [...lines.slice(0, start), ...lines.slice(end)];
  }

  const body = kept.join('\n').replace(/\n*$/, '');
  const entries = Object.entries(overrides).map(
    ([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
  );

  return `${body ? `${body}\n` : ''}overrides:\n${entries.join('\n')}\n`;
}

export function writeOverrides(dir, overrides, { env = process.env, major } = {}) {
  const pnpm = major ?? pnpmMajor(dir, env);
  const packagePath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  if (pnpm < 11) {
    pkg.pnpm = { ...pkg.pnpm, overrides };
  } else {
    const workspacePath = path.join(dir, 'pnpm-workspace.yaml');
    const yaml = fs.existsSync(workspacePath) ? fs.readFileSync(workspacePath, 'utf8') : '';

    fs.writeFileSync(workspacePath, workspaceWithOverrides(yaml, overrides));
    delete pkg.pnpm?.overrides;

    if (pkg.pnpm && Object.keys(pkg.pnpm).length === 0) delete pkg.pnpm;
  }

  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

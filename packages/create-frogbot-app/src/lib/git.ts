import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(dest: string, command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { cwd: dest, stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

export function initializeGit(dest: string): boolean {
  if (run(dest, 'git', ['rev-parse', '--is-inside-work-tree'])) return true;
  if (run(dest, 'hg', ['--cwd', '.', 'root'])) return true;

  if (!run(dest, 'git', ['init'])) return false;

  const committed =
    (run(dest, 'git', ['config', 'init.defaultBranch']) ||
      run(dest, 'git', ['checkout', '-b', 'main'])) &&
    run(dest, 'git', ['add', '-A']) &&
    run(dest, 'git', ['commit', '-m', 'Initial commit from Create FrogBot App']);

  if (!committed) fs.rmSync(path.join(dest, '.git'), { recursive: true, force: true });

  return committed;
}

import { execFileSync } from 'node:child_process';

export function initializeGit(dest: string): boolean {
  let insideRepository = false;

  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dest, stdio: 'ignore' });
    insideRepository = true;
  } catch {
    insideRepository = false;
  }

  if (insideRepository) return true;

  try {
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: dest, stdio: 'ignore' });
    } catch {
      execFileSync('git', ['init'], { cwd: dest, stdio: 'ignore' });
      execFileSync('git', ['checkout', '-b', 'main'], { cwd: dest, stdio: 'ignore' });
    }

    execFileSync('git', ['add', '-A'], { cwd: dest, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'feat: initial commit'], { cwd: dest, stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

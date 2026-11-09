import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const script = readFileSync(
  path.join(import.meta.dirname, '../../../scripts/cloud-setup.sh'),
  'utf8',
);

const localMain = /^# 3\. .*?(?=^# 4\. )/ms.exec(script)?.[0] ?? '';

const dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function commit(cwd: string, message: string) {
  git(cwd, 'commit', '-q', '--allow-empty', '-m', message);

  return git(cwd, 'rev-parse', 'HEAD');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('cloud-setup local main', () => {
  it('follows origin main after upstream is force-pushed', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cloud-setup-'));

    dirs.push(dir);

    const upstream = path.join(dir, 'upstream.git');
    const writer = path.join(dir, 'writer');
    const checkout = path.join(dir, 'checkout');

    git(dir, 'init', '-q', '--bare', '-b', 'main', upstream);
    git(dir, 'clone', '-q', upstream, writer);
    const first = commit(writer, 'a');

    commit(writer, 'b');
    git(writer, 'push', '-q', 'origin', 'main');
    git(dir, 'clone', '-q', '--depth=1', `file://${upstream}`, checkout);
    git(checkout, 'checkout', '-q', '-b', 'claude/ticket-1-scratch');
    git(writer, 'reset', '-q', '--hard', first);
    const rewritten = commit(writer, 'c');

    git(writer, 'push', '-q', '--force', 'origin', 'main');

    expect(localMain).toContain('fetch');

    const run = spawnSync(
      'bash',
      ['-c', `root=${checkout}\nstatus=0\n${localMain}\necho "$status"`],
      {
        encoding: 'utf8',
      },
    );

    expect(run.stdout.trim()).toBe('0');
    expect(git(checkout, 'rev-parse', 'main')).toBe(rewritten);
  });
});

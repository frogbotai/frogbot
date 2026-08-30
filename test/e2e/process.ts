import type { ChildProcess } from 'node:child_process';

export async function terminateProcess(child?: ChildProcess): Promise<void> {
  if (!child?.pid || child.exitCode !== null) return;

  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  await closed;
}

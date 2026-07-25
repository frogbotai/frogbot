import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function resolveSourceDir(cwd: string): string {
  const srcDir = join(resolve(cwd), 'src');
  try {
    if (existsSync(srcDir) && statSync(srcDir).isDirectory()) return srcDir;
  } catch {
    return resolve(cwd);
  }
  return resolve(cwd);
}

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const NEXT_CONFIG_FILES = ['next.config.ts', 'next.config.mjs', 'next.config.js', 'next.config.cjs'];

export function findNextConfig(cwd: string): string | null {
  for (const file of NEXT_CONFIG_FILES) {
    const candidate = path.join(cwd, file);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveNextBin(cwd: string): string {
  const require = createRequire(path.join(cwd, 'package.json'));
  return require.resolve('next/dist/bin/next');
}

export function runNext(command: 'dev' | 'start', args: string[] = []): void {
  const cwd = process.cwd();

  if (!findNextConfig(cwd)) {
    console.error(
      `[frogbot] no next.config.{ts,mjs,js,cjs} found in ${cwd}. ` +
        `\`frogbot ${command}\` runs your Next.js app — create one with \`npm create frogbot-app\` or add a next.config.ts.`,
    );
    process.exit(1);
  }

  let nextBin: string;
  try {
    nextBin = resolveNextBin(cwd);
  } catch {
    console.error('[frogbot] could not resolve `next` from this project. Install it: pnpm add next');
    process.exit(1);
  }

  const child = spawn(process.execPath, [nextBin, command, ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

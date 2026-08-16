import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const NEXT_CONFIG_FILES = [
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'next.config.cjs',
];

export function findNextConfig(cwd: string): string | null {
  for (const file of NEXT_CONFIG_FILES) {
    const candidate = path.join(cwd, file);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function canResolveFromProject(cwd: string, specifier: string): boolean {
  try {
    const require = createRequire(path.join(cwd, 'package.json'));
    require.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

export function resolveNextBin(cwd: string): string {
  const require = createRequire(path.join(cwd, 'package.json'));
  return require.resolve('next/dist/bin/next');
}

export function runNext(command: 'dev' | 'start', args: string[] = []): void {
  const cwd = process.cwd();

  const configFile = findNextConfig(cwd);
  if (!configFile) {
    console.error(
      `[frogbot] no next.config.{ts,mjs,js,cjs} found in ${cwd}. ` +
        `\`frogbot ${command}\` runs your Next.js app — create one with \`npm create frogbot-app\` or add a next.config.mjs.`,
    );
    process.exit(1);
  }

  // `next start` must be able to parse next.config.ts, which requires the
  // TypeScript compiler at runtime. Instead of letting Next.js silently
  // install it on a production machine, fail fast with an actionable message.
  if (path.basename(configFile) === 'next.config.ts' && !canResolveFromProject(cwd, 'typescript')) {
    console.error(
      `[frogbot] ${configFile} requires TypeScript at runtime, but \`typescript\` is not installed. ` +
        `Rename it to next.config.mjs, or add \`typescript\` to your dependencies.`,
    );
    process.exit(1);
  }

  let nextBin: string;
  try {
    nextBin = resolveNextBin(cwd);
  } catch {
    console.error(
      '[frogbot] could not resolve `next` from this project. Install it: pnpm add next',
    );
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

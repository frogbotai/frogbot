import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

type Tsconfig = { include?: unknown };

const toPosix = (path: string) => path.replaceAll('\\', '/');

const generatedTypes = (entry: string) => /^(?:\.\/)?(?:\.next|\.frogbot\/builds)\//.test(entry);

function stripJsonc(text: string): string {
  let out = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      const end = /^"(?:[^"\\]|\\.)*"/.exec(text.slice(i))?.[0] ?? char;

      out += end;
      i += end.length - 1;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;

      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) break;
      i++;
    } else {
      out += char;
    }
  }

  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readTsconfig(file: string): Tsconfig | undefined {
  try {
    return JSON.parse(stripJsonc(readFileSync(file, 'utf8'))) as Tsconfig;
  } catch {
    return undefined;
  }
}

/**
 * Writes `<distDir>.tsconfig.json` beside the build folder: the app's tsconfig, with only this build's
 * generated types included, so a build never type-checks against the other build folder's routes.
 * Returns its path from `cwd`, or `undefined` when the app has no tsconfig to extend.
 */
export function writeSlotTsconfig(
  distDir: string,
  base = 'tsconfig.json',
  cwd = process.cwd(),
): string | undefined {
  const root = join(cwd, base);

  if (!existsSync(root)) return undefined;

  const config = readTsconfig(root);

  if (!config) return undefined;

  const dir = join(cwd, dirname(distDir));
  const slot = basename(distDir);
  const file = join(dir, `${slot}.tsconfig.json`);
  const fromFile = (entry: string) =>
    isAbsolute(entry) ? entry : toPosix(relative(dir, join(dirname(root), entry)));

  const include = [
    ...(Array.isArray(config.include) ? (config.include as string[]) : ['**/*'])
      .filter((entry) => !generatedTypes(entry))
      .map(fromFile),
    `${slot}/types/**/*.ts`,
    `${slot}/dev/types/**/*.ts`,
  ];

  mkdirSync(dir, { recursive: true });

  writeFileSync(
    file,
    `${JSON.stringify({ extends: toPosix(relative(dir, root)), include }, null, 2)}\n`,
  );

  return toPosix(relative(cwd, file));
}

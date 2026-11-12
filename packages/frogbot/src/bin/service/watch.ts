import { type FSWatcher, readFileSync, watch as fsWatch } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Folders watched recursively. */
export const WATCHED_DIRS = ['src', 'public'];

const ROOT_FILES = [
  /^frogbot\.config\.[cm]?[jt]s$/,
  /^next\.config\.[cm]?[jt]s$/,
  /^tsconfig\.json$/,
  /^package\.json$/,
  /^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/,
  /^\.env(\..+)?$/,
];

const IGNORED = [
  /(^|\/)(\.frogbot|\.next|node_modules)(\/|$)/,
  /\.(db|sqlite3?)(-.*)?$/,
  /\.db-/,
  /(^|\/)importMap\.js$/,
  /\.tsbuildinfo$/,
  /(^|\/)\.DS_Store$/,
  /~$|\.sw[px]$/,
];

/** Whether a change at `path` (relative to the app, `/`-separated) needs a rebuild. */
export function shouldRebuild(path: string): boolean {
  if (IGNORED.some((pattern) => pattern.test(path))) return false;

  const [first, ...rest] = path.split('/');

  if (rest.length) return WATCHED_DIRS.includes(first);

  return ROOT_FILES.some((pattern) => pattern.test(first));
}

/** `tsconfig.json` without the `include` entries Next adds for a build folder, to tell its edit from the user's. */
export function tsconfigShape(text: string): string {
  try {
    const json = JSON.parse(text) as { include?: unknown };

    if (Array.isArray(json.include)) {
      json.include = json.include.filter(
        (entry) => !(typeof entry === 'string' && entry.startsWith('.frogbot/')),
      );
    }

    return JSON.stringify(json);
  } catch {
    return text;
  }
}

type Watch = (
  path: string,
  options: { recursive: boolean },
  listener: (event: string, file: string | Buffer | null) => void,
) => FSWatcher;

function inside(dir: string, file: string): string | undefined {
  const path = relative(dir, resolve(dir, file));

  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return undefined;

  return path.split(sep).join('/');
}

/**
 * Calls `onChange` with the paths that changed once `debounce` ms pass with no change that needs a
 * rebuild: agents write several files over a second or two (420 D4). `ignore` names a file the
 * build itself writes, such as the types file, so its write starts no second build.
 */
export function watchApp({
  dir,
  onChange,
  ignore = () => undefined,
  debounce = 1500,
  watch = fsWatch,
}: {
  dir: string;
  onChange: (paths: string[]) => void;
  ignore?: () => string | undefined;
  debounce?: number;
  watch?: Watch;
}): { close: () => void } {
  const watchers: FSWatcher[] = [];
  const tsconfig = join(dir, 'tsconfig.json');
  let shape = readShape(tsconfig);
  let timer: NodeJS.Timeout | undefined;
  let seen = new Set<string>();

  function flush() {
    const paths = [...seen];

    seen = new Set();
    onChange(paths);
  }

  function changed(path: string) {
    if (!shouldRebuild(path)) return;

    const ignored = ignore();

    if (ignored && path === inside(dir, ignored)) return;

    if (path === 'tsconfig.json') {
      const next = readShape(tsconfig);

      if (next === shape) return;

      shape = next;
    }

    seen.add(path);
    clearTimeout(timer);
    timer = setTimeout(flush, debounce);
  }

  const listen = (base: string, recursive: boolean) => {
    try {
      const watcher = watch(join(dir, base), { recursive }, (_event, file) => {
        if (file === null) return;

        const name = String(file).split(sep).join('/');

        changed(base ? `${base}/${name}` : name);
      });

      watcher.on('error', () => {});
      watchers.push(watcher);
    } catch {}
  };

  listen('', false);

  for (const base of WATCHED_DIRS) listen(base, true);

  return {
    close() {
      clearTimeout(timer);

      for (const watcher of watchers) watcher.close();
    },
  };
}

function readShape(file: string): string | undefined {
  try {
    return tsconfigShape(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

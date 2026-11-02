import { type FSWatcher, readFileSync, watch as fsWatch } from 'node:fs';
import { join, sep } from 'node:path';

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

/**
 * Calls `onChange` once `debounce` ms pass with no change that needs a rebuild: agents write several
 * files over a second or two (420 D4).
 */
export function watchApp({
  dir,
  onChange,
  debounce = 1500,
  watch = fsWatch,
}: {
  dir: string;
  onChange: () => void;
  debounce?: number;
  watch?: Watch;
}): { close: () => void } {
  const watchers: FSWatcher[] = [];
  const tsconfig = join(dir, 'tsconfig.json');
  let shape = readShape(tsconfig);
  let timer: NodeJS.Timeout | undefined;

  function changed(path: string) {
    if (!shouldRebuild(path)) return;

    if (path === 'tsconfig.json') {
      const next = readShape(tsconfig);

      if (next === shape) return;

      shape = next;
    }

    clearTimeout(timer);
    timer = setTimeout(onChange, debounce);
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

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export interface LocalPackage {
  directory: string;
  name: string;
  tarball: string;
  version: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  publishConfig?: {
    exports?: Record<string, string | { default?: string; import?: string; types?: string }>;
    main?: string;
    types?: string;
  };
  version: string;
}

export function run(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): { output: string; status: number } {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });

  return {
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? 1,
  };
}

function readPackage(directory: string): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as PackageJson;
}

function workspacePackageDirectories(repoRoot: string): Map<string, string> {
  const directories = new Map<string, string>();
  const packagesRoot = path.join(repoRoot, 'packages');

  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const directory = path.join(packagesRoot, entry.name);
    const packagePath = path.join(directory, 'package.json');

    if (!fs.existsSync(packagePath)) continue;

    directories.set(readPackage(directory).name, directory);
  }

  return directories;
}

function workspaceDependencies(pkg: PackageJson): string[] {
  const sections = [pkg.dependencies, pkg.optionalDependencies, pkg.peerDependencies];
  const names = new Set<string>();

  for (const section of sections) {
    for (const [name, version] of Object.entries(section ?? {})) {
      if (version.startsWith('workspace:')) names.add(name);
    }
  }

  return [...names];
}

function publishTargets(pkg: PackageJson): string[] {
  const targets = new Set<string>();

  if (pkg.publishConfig?.main) targets.add(pkg.publishConfig.main);
  if (pkg.publishConfig?.types) targets.add(pkg.publishConfig.types);

  for (const value of Object.values(pkg.publishConfig?.exports ?? {})) {
    if (typeof value === 'string') targets.add(value);
    else {
      if (value.default) targets.add(value.default);
      if (value.import) targets.add(value.import);
      if (value.types) targets.add(value.types);
    }
  }

  return [...targets];
}

function targetPattern(target: string): RegExp {
  const escaped = target
    .replace(/^\.\//, '')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '[^/]+');

  return new RegExp(`^${escaped}$`);
}

function builtTargetExists(directory: string, target: string): boolean {
  if (!target.includes('*')) return fs.existsSync(path.resolve(directory, target));

  const pattern = targetPattern(target);
  const files = fs.readdirSync(directory, { recursive: true, withFileTypes: true });

  return files.some(
    (entry) =>
      entry.isFile() &&
      pattern.test(path.relative(directory, path.join(entry.parentPath, entry.name))),
  );
}

export function packLocalClosure({
  appDirectories,
  outputDirectory,
  repoRoot,
}: {
  appDirectories: string[];
  outputDirectory: string;
  repoRoot: string;
}): LocalPackage[] {
  const workspace = workspacePackageDirectories(repoRoot);
  const pending = appDirectories.flatMap((directory) =>
    Object.keys(readPackage(directory).dependencies ?? {}).filter((name) => workspace.has(name)),
  );
  const selected = new Map<string, string>();

  while (pending.length > 0) {
    const name = pending.shift()!;

    if (selected.has(name)) continue;

    const directory = workspace.get(name);

    if (!directory) throw new Error(`Missing local package ${name}.`);

    selected.set(name, directory);

    for (const dependency of workspaceDependencies(readPackage(directory))) {
      if (workspace.has(dependency)) pending.push(dependency);
    }
  }

  fs.mkdirSync(outputDirectory, { recursive: true });

  const packages: LocalPackage[] = [];

  for (const [name, directory] of selected) {
    const pkg = readPackage(directory);

    const targets = publishTargets(pkg);

    for (const target of targets) {
      if (!builtTargetExists(directory, target)) {
        throw new Error(`${name} publish target is missing: ${target}`);
      }
    }

    const packed = run('pnpm', ['pack', '--pack-destination', outputDirectory], { cwd: directory });

    if (packed.status !== 0) throw new Error(`Could not pack ${name}:\n${packed.output}`);

    const filename = packed.output.trim().split('\n').at(-1);

    if (!filename) throw new Error(`pnpm pack did not report a tarball for ${name}.`);

    const tarball = path.resolve(directory, filename);
    const listing = run('tar', ['-tf', tarball], { cwd: directory });

    if (listing.status !== 0 || !listing.output.includes('package/package.json')) {
      throw new Error(`Invalid tarball for ${name}.`);
    }

    const packedFiles = listing.output.trim().split('\n');

    for (const target of targets) {
      const pattern = targetPattern(`package/${target.replace(/^\.\//, '')}`);

      if (!packedFiles.some((file) => pattern.test(file))) {
        throw new Error(`${name} tarball is missing publish target: ${target}`);
      }
    }

    packages.push({ directory, name, tarball, version: pkg.version });
  }

  return packages;
}

export function applyLocalOverrides(appDirectory: string, packages: LocalPackage[]): void {
  const packagePath = path.join(appDirectory, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageJson & {
    pnpm?: { overrides?: Record<string, string> };
  };
  const overrides = Object.fromEntries(
    packages.map(({ name, tarball }) => [name, `file:${tarball}`]),
  );

  pkg.pnpm = { ...pkg.pnpm, overrides };

  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

export function serviceAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });

    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

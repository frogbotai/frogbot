import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildStale, discoverChecks, workspacePackages } from '../check.mjs';
import {
  loadConfig,
  playwrightMatcher,
  playwrightProjects,
  resolveExtensionless,
} from '../check-tests.mjs';
import { commandName, groupSize, testTypeDirs, typecheckAreas } from './affected.mjs';

const MAIN = 'main';

const ENV = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };

const VITEST_PROJECTS = ['unit', 'gateway-unit', 'ui', 'int'];

const PLAYWRIGHT_CONFIG = 'test/browser/playwright.config.ts';

// Playwright reads these by path rather than by import; every browser project depends on them.
const BROWSER_SCRIPTS = [
  'test/browser/auth.setup.ts',
  'test/browser/buildFixtures.mjs',
  'test/browser/pushSchema.ts',
  'test/browser/resetDatabase.mjs',
];

const RELATIVE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

const BARE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"]((?:@[\w.-]+\/)?[\w.-]+)(?:\/[^'"]*)?['"]/g;

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

const RUNTIME_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

function git(root, args, { ok = [0] } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: ENV,
    maxBuffer: 256 * 1024 * 1024,
  });

  if (!ok.includes(result.status)) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr ?? '').split('\n')[0]}`);
  }

  return result.stdout ?? '';
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function read(root, file) {
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch {
    return undefined;
  }
}

export function changedFiles(root) {
  const base = git(root, ['merge-base', MAIN, 'HEAD']).trim();
  const changed = lines(git(root, ['diff', '--name-only', base]));
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard']));

  return [...new Set([...changed, ...untracked])].sort();
}

// The patch-id of the working tree against the merge base with local `main`, untracked files
// included, so it equals `git patch-id` of `main...HEAD` once the same change is committed. The
// diff is staged into a throwaway copy of the index, so the real index is never touched.
export function worktreePatchId(root) {
  const base = git(root, ['merge-base', MAIN, 'HEAD']).trim();
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'frogbot-verify-'));
  const index = path.join(scratch, 'index');
  const real = path.resolve(root, git(root, ['rev-parse', '--git-path', 'index']).trim());

  try {
    if (existsSync(real)) copyFileSync(real, index);

    const env = { ...ENV, GIT_INDEX_FILE: index };
    const run = (args, input) =>
      spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        env,
        input,
        maxBuffer: 256 * 1024 * 1024,
      });

    run(['add', '--all']);

    const diff = run(['diff', '--cached', '--no-color', '--no-ext-diff', base]).stdout ?? '';

    return run(['patch-id', '--stable'], diff ? `${diff}\n` : '').stdout.split(' ')[0] || null;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function packageInputs(root, log) {
  return workspacePackages(log)
    .filter(({ dir }) => dir !== '')
    .map((pkg) => {
      const manifest = JSON.parse(read(root, path.join(pkg.dir, 'package.json')));
      const script = manifest.scripts?.typecheck ?? '';
      const runs = /^node\s+(\S+\.mjs)\b/.exec(script)?.[1];
      const text = runs ? (read(root, path.join(pkg.dir, runs)) ?? '') : '';
      const areas = typecheckAreas({ dir: pkg.dir, text });
      const workspace = RUNTIME_FIELDS.flatMap((field) =>
        Object.entries(manifest[field] ?? {})
          .filter(([, version]) => String(version).startsWith('workspace:'))
          .map(([name]) => name),
      );

      return {
        ...pkg,
        typeTests: testTypeDirs(script),
        areas: areas.length > 0 ? areas : undefined,
        workspace,
      };
    });
}

async function vitestInputs(root, files) {
  const { createVitest } = await import('vitest/node');
  const vitest = await createVitest('test', {
    root,
    watch: false,
    project: VITEST_PROJECTS,
    reporters: [],
  });

  try {
    const changed = new Set(files.map((file) => path.join(root, file)));
    const relative = (file) => path.relative(root, file).split(path.sep).join('/');
    const specs = await vitest.specifications.globTestSpecifications();
    const projects = new Map(VITEST_PROJECTS.map((name) => [name, []]));
    const related = [];

    for (const spec of specs) {
      projects.get(spec.project.name)?.push(relative(spec.moduleId));

      const deps = await vitest.specifications.getTestDependencies(spec);
      const sources = [...deps].filter((dep) => changed.has(dep)).map(relative);

      if (sources.length > 0) {
        related.push({ project: spec.project.name, spec: relative(spec.moduleId), sources });
      }
    }

    return {
      vitest: [...projects].map(([name, list]) => ({ name, specs: list.sort() })),
      related,
    };
  } finally {
    await vitest.close();
  }
}

function importClosure(root, entry, seen = new Set()) {
  if (seen.has(entry)) return seen;

  const text = read(root, entry);

  if (text === undefined) return seen;

  seen.add(entry);

  for (const [, specifier] of text.matchAll(RELATIVE_IMPORT)) {
    const base = path.posix.join(path.posix.dirname(entry), specifier);
    const stem = base.replace(/\.[cm]?js$/, '');
    const target = [base, `${stem}.ts`, `${stem}.tsx`, `${base}.ts`, `${base}/index.ts`].find(
      (candidate) =>
        existsSync(path.join(root, candidate)) && statSync(path.join(root, candidate)).isFile(),
    );

    if (target) importClosure(root, target, seen);
  }

  return seen;
}

function fixturePackages(root, fixture, tracked, packages) {
  const names = new Set(packages.map(({ name }) => name));
  const direct = new Set();

  for (const file of tracked.filter((name) => name.startsWith(`${fixture}/`))) {
    if (!SOURCE_FILE.test(file) && path.posix.basename(file) !== 'package.json') continue;

    for (const [, name] of (read(root, file) ?? '').matchAll(BARE_IMPORT)) {
      if (names.has(name)) direct.add(name);
    }

    if (path.posix.basename(file) === 'package.json') {
      const manifest = JSON.parse(read(root, file) ?? '{}');

      for (const field of ['devDependencies', ...RUNTIME_FIELDS]) {
        Object.keys(manifest[field] ?? {})
          .filter((name) => names.has(name))
          .forEach((name) => direct.add(name));
      }
    }
  }

  const closure = new Set();
  const visit = (name) => {
    if (closure.has(name)) return;

    closure.add(name);
    packages.find((pkg) => pkg.name === name)?.workspace.forEach(visit);
  };

  direct.forEach(visit);

  return [...closure].sort();
}

async function browserInputs(root, packages) {
  resolveExtensionless();

  const config = await loadConfig(PLAYWRIGHT_CONFIG);
  const tracked = lines(git(root, ['ls-files']));
  const servers = [config.webServer ?? []].flat();
  const matchers = playwrightProjects(config, PLAYWRIGHT_CONFIG);
  const projects = [];

  for (const [index, project] of (config.projects ?? []).entries()) {
    const server = project.dependencies?.[0]?.replace(/-setup$/, '');
    const cwd = servers.find(({ name }) => name === server)?.cwd;

    if (!cwd) continue;

    const { testDir, testMatch, testIgnore } = matchers[index];
    const specs = tracked.filter((file) => {
      const absolute = path.join(root, file);

      return (
        absolute.startsWith(`${testDir}${path.sep}`) &&
        playwrightMatcher(testMatch)(absolute) &&
        !playwrightMatcher(testIgnore)(absolute)
      );
    });

    projects.push({ name: project.name, fixture: path.relative(root, cwd), specs });
  }

  const infrastructure = [PLAYWRIGHT_CONFIG, ...BROWSER_SCRIPTS].flatMap((entry) => [
    ...importClosure(root, entry),
  ]);

  const specs = [...new Set(projects.flatMap((project) => project.specs))];
  const fixtures = [...new Set(projects.map(({ fixture }) => fixture))];

  return {
    projects,
    infrastructure: [...new Set(infrastructure)],
    imports: Object.fromEntries(specs.map((spec) => [spec, [...importClosure(root, spec)]])),
    fixturePackages: Object.fromEntries(
      fixtures.map((fixture) => [fixture, fixturePackages(root, fixture, tracked, packages)]),
    ),
  };
}

// Everything `affectedSet` needs for the working tree at `root`, read from git, pnpm, Vitest and
// the Playwright config.
export async function verifyInputs(root, log, files = changedFiles(root)) {
  const packages = packageInputs(root, log);
  const { vitest, related } = await vitestInputs(root, files);
  const browser = await browserInputs(root, packages);

  return { files, packages, vitest, related, browser, checks: discoverChecks() };
}

function duration(ms) {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function runCommand(log, args, cwd) {
  appendFileSync(log, `\n$ ${args.join(' ')}  (${cwd})\n`);

  const start = statSync(log).size;
  const fd = openSync(log, 'a');
  const result = spawnSync(args[0], args.slice(1), { cwd, env: ENV, stdio: ['ignore', fd, fd] });

  closeSync(fd);

  const code = result.status ?? 1;

  appendFileSync(log, `→ exit ${code}\n`);

  return { ok: code === 0, output: readFileSync(log).subarray(start).toString('utf8') };
}

// Builds stale packages, then runs each group's commands in order, printing one line per group.
// Stops at the first failing command; the groups after it are printed as skipped.
export async function runGroups({ root, log, groups, build = buildStale }) {
  const width = Math.max('uncovered'.length, ...groups.map(({ group }) => group.length));
  const label = (name) => name.padEnd(width);
  const built = await build(log);

  if (!built.ok) {
    console.log(`${label('build')}  failed`);

    return {
      ok: false,
      passed: [],
      failed: {
        group: 'build',
        command: 'build stale packages',
        output: built.groups.flat().join('\n'),
      },
    };
  }

  const passed = [];

  for (const [index, entry] of groups.entries()) {
    const started = performance.now();

    for (const args of entry.commands) {
      const result = runCommand(log, args, root);

      if (!result.ok) {
        console.log(
          `${label(entry.group)}  failed · ${commandName(args)} · ${duration(performance.now() - started)}`,
        );

        for (const rest of groups.slice(index + 1)) console.log(`${label(rest.group)}  skipped`);

        return {
          ok: false,
          passed,
          failed: { group: entry.group, command: args.join(' '), output: result.output },
        };
      }
    }

    console.log(
      `${label(entry.group)}  ok · ${groupSize(entry)} · ${duration(performance.now() - started)}`,
    );
    passed.push(entry);
  }

  return { ok: true, passed, failed: null };
}

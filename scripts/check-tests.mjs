#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

const VITEST_CONFIG = 'vitest.config.ts';

const PLAYWRIGHT_CONFIGS = ['test/browser/playwright.config.ts'];

export const READ_ONLY = {
  'test/frogbot-instance/boot.int.spec.ts': 'checks the booted collections and a 404 route',
  'test/frogbot-instance/properties.int.spec.ts': 'checks instance properties',
  'test/graphql/disabled/int.spec.ts': 'checks that GraphQL routes are off',
  'test/graphql/productionOptIn/int.spec.ts': 'checks the playground and introspection',
  'test/search/mongodb/hybrid.int.spec.ts': 'searches articles seeded once in beforeAll',
  'test/search/mongodb/indexes.int.spec.ts': 'checks search index definitions, not documents',
  'test/search/mongodb/searchMany.int.spec.ts': 'searches articles seeded once in beforeAll',
};

const SOURCE_TEST = /^packages\/.+\/src\/(?:.+\/)?[^/]+\.(?:spec|test)(?:-d)?\.[cm]?[jt]sx?$/;

const SPEC = /\.spec\.[cm]?[jt]sx?$/;

const INT_SPEC = /int\.spec\.ts$/;

const SCRIPT = /^test\/.+\.[cm]?[jt]sx?$/;

const OWN_SPEC = 'test/unit/scripts/checkTests.spec.ts';

const BOOT = /\bbootFrogBot\(/;

const RESET = /(?<!function )\bclearAndSeed\(/;

const RELATIVE_IMPORT = /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;

const MKDTEMP = /\bmkdtemp(?:Sync)?\(/g;

const SCRATCH_ROOT = /\btmpdir\(\)|\btest\/\.tmp\b/;

const DEFINITION_DEPTH = 4;

const VITEST_DEFAULT_EXCLUDE = ['**/node_modules/**', '**/.git/**'];

const PLAYWRIGHT_DEFAULT_IGNORE = ['**/node_modules/**'];

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function sourceTests(files) {
  return files
    .filter((file) => SOURCE_TEST.test(file))
    .map((file) => ({ file, message: 'test file under src: move it to test/unit/<package>/' }));
}

export function playwrightMatcher(patterns) {
  const list = [patterns].flat();

  return (file) =>
    list.some((pattern) =>
      pattern instanceof RegExp
        ? new RegExp(pattern.source, pattern.flags.replace('g', '')).test(file)
        : path.matchesGlob(file, pattern.startsWith('**/') ? pattern : `**/${pattern}`),
    );
}

export function vitestProjects(config) {
  const projects = config.test?.projects ?? [config];

  return projects.map((project) => {
    if (typeof project !== 'object' || project.test?.root || project.test?.dir || project.root) {
      throw new Error(`${VITEST_CONFIG}: only inline projects without root or dir are supported`);
    }

    return {
      name: project.test.name ?? 'default',
      include: project.test.include ?? [],
      exclude: project.test.exclude ?? VITEST_DEFAULT_EXCLUDE,
    };
  });
}

export function playwrightProjects(config, configFile) {
  const configDir = path.dirname(path.resolve(ROOT, configFile));

  return (config.projects ?? [config]).map((project) => ({
    name: project.name ?? 'default',
    testDir: path.resolve(configDir, project.testDir ?? config.testDir ?? '.'),
    testMatch: project.testMatch ?? config.testMatch ?? '**/*.@(spec|test).?(c|m)[jt]s?(x)',
    testIgnore: project.testIgnore ?? config.testIgnore ?? PLAYWRIGHT_DEFAULT_IGNORE,
  }));
}

export function unassignedSpecs({ files, vitest, playwright, root = ROOT }) {
  const inVitest = (file) =>
    vitest.some(
      ({ include, exclude }) =>
        include.some((glob) => path.matchesGlob(file, glob)) &&
        !exclude.some((glob) => path.matchesGlob(file, glob)),
    );

  const inPlaywright = (file) => {
    const absolute = path.join(root, file);

    return playwright.some(
      ({ testDir, testMatch, testIgnore }) =>
        absolute.startsWith(`${testDir}${path.sep}`) &&
        playwrightMatcher(testMatch)(absolute) &&
        !playwrightMatcher(testIgnore)(absolute),
    );
  };

  return files
    .filter((file) => SPEC.test(file) && !inVitest(file) && !inPlaywright(file))
    .map((file) => ({ file, message: 'spec matches no vitest or Playwright project' }));
}

function importedSources(file, source, read) {
  return [...source.matchAll(RELATIVE_IMPORT)].flatMap(([, specifier]) => {
    const base = path.posix.join(path.posix.dirname(file), specifier).replace(/\.[cm]?js$/, '');
    const candidates = [`${base}.ts`, `${base}.js`, `${base}/index.ts`, base];

    for (const candidate of candidates) {
      const text = read(candidate);

      if (text !== undefined) return [text];
    }

    return [];
  });
}

export function unresetSuites({ files, read, readOnly = READ_ONLY }) {
  const problems = [];

  for (const file of files.filter((name) => INT_SPEC.test(name))) {
    const source = read(file);

    if (source === undefined || !BOOT.test(source)) continue;

    const resets =
      RESET.test(source) || importedSources(file, source, read).some((text) => RESET.test(text));

    if (resets && file in readOnly) {
      problems.push({ file, message: 'calls clearAndSeed: remove it from READ_ONLY' });
    } else if (!resets && !(file in readOnly)) {
      problems.push({
        file,
        line: lineOf(source, source.search(BOOT)),
        message:
          'calls bootFrogBot without clearAndSeed: reset in beforeEach, or add it to READ_ONLY if its tests only read',
      });
    }
  }

  for (const file of Object.keys(readOnly)) {
    if (!files.includes(file) || !BOOT.test(read(file) ?? '')) {
      problems.push({ file, message: 'listed in READ_ONLY but is not a tracked bootFrogBot spec' });
    }
  }

  return problems;
}

function callArguments(source, open) {
  let depth = 0;
  let quote;

  for (let index = open; index < source.length; index++) {
    const char = source[index];

    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')' && --depth === 0) {
      return source.slice(open + 1, index);
    }
  }

  return '';
}

function expand(expression, source, depth) {
  if (depth === 0) return expression;

  return expression.replace(/\b[A-Za-z_$][\w$]*\b/g, (name) => {
    const definition = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*([^;]+);`).exec(source);

    return definition ? `(${expand(definition[1], source, depth - 1)})` : name;
  });
}

export function repoScratchDirs({ file, source }) {
  const problems = [];

  for (const match of source.matchAll(MKDTEMP)) {
    const open = match.index + match[0].length - 1;
    const prefix = expand(callArguments(source, open), source, DEFINITION_DEPTH).replace(
      /['"`]\s*,\s*['"`]/g,
      '/',
    );

    if (SCRATCH_ROOT.test(prefix)) continue;

    problems.push({
      file,
      line: lineOf(source, match.index),
      message:
        'mkdtemp outside os.tmpdir() or test/.tmp/: scratch folders inside the repo break lint',
    });
  }

  return problems;
}

function trackedFiles() {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });

  if (listed.status !== 0) {
    console.error(`tests: git ls-files failed: ${listed.stderr.trim()}`);
    process.exit(2);
  }

  return listed.stdout
    .split('\0')
    .filter((file) => file && existsSync(path.join(ROOT, file)))
    .sort();
}

function read(file) {
  try {
    return readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return undefined;
  }
}

export function loadConfig(file) {
  return import(pathToFileURL(path.join(ROOT, file)).href).then((module) => module.default);
}

export function resolveExtensionless() {
  registerHooks({
    resolve(specifier, context, next) {
      try {
        return next(specifier, context);
      } catch (error) {
        if (!specifier.startsWith('.')) throw error;

        return next(`${specifier}.ts`, context);
      }
    },
  });
}

async function main() {
  resolveExtensionless();

  const files = trackedFiles();
  const vitest = vitestProjects(await loadConfig(VITEST_CONFIG));
  const playwright = [];

  for (const configFile of PLAYWRIGHT_CONFIGS) {
    playwright.push(...playwrightProjects(await loadConfig(configFile), configFile));
  }

  const problems = [
    ...sourceTests(files),
    ...unassignedSpecs({ files, vitest, playwright }),
    ...unresetSuites({ files, read }),
    ...files
      .filter((file) => SCRIPT.test(file) && file !== OWN_SPEC)
      .flatMap((file) => repoScratchDirs({ file, source: read(file) ?? '' })),
  ];

  if (problems.length === 0) {
    console.log(
      `✔ ${files.filter((file) => SPEC.test(file)).length} specs follow the test layout.`,
    );

    return;
  }

  for (const { file, line, message } of problems) {
    console.error(`${line ? `${file}:${line}` : file} ${message}`);
  }

  console.error(
    `\n${problems.length} test layout ${problems.length === 1 ? 'problem' : 'problems'}.`,
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

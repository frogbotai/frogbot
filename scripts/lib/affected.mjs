import path from 'node:path';

const INT_TEST = /^test\/(?!unit\/|ui\/|browser\/|types\/|e2e\/|live\/|gateway\/)/;

const RUNS = [
  { script: 'test:int:sqlite', prefixes: ['packages/'], pattern: INT_TEST },
  {
    script: 'test:browser',
    prefixes: [
      'packages/ui/',
      'packages/next/',
      'test/browser/',
      'templates/blank/',
      'test/e2e/fixtures/',
    ],
  },
];

const DOCS = /\.mdx?$/;

const UNIT_SPEC = /^test\/unit\/(?!gateway\/).*\.spec\.ts$/;

const READS_MARKDOWN = /\.mdx?\b/;

const TYPE_TEST = /^test\/unit\/([^/]+)\/.+\.test-d\.ts$/;

const DOCS_PAGES = ['docs/**', 'skills/**', 'README.md', '**/README.md'];

const MANIFESTS = ['package.json', '**/package.json'];

// The files each `pnpm check <name>` reads, besides its own scripts/check-<name>.mjs.
export const CHECK_INPUTS = {
  branding: [...DOCS_PAGES, 'templates/**', 'examples/**', 'packages/create-frogbot-app/**'],
  'dist-imports': ['packages/**/src/**', ...MANIFESTS],
  'docs-fences': ['docs/**'],
  'docs-links': ['docs/**', 'skills/**'],
  'docs-references': [...DOCS_PAGES, 'templates/*/README.md', 'packages/frogbot/src/bin/**'],
  generated: ['**/importMap.js', '**/frogbot-types.ts', '**/piece-types.ts'],
  'option-tables': ['docs/**'],
  packages: ['pnpm-workspace.yaml', ...MANIFESTS],
  scripts: ['CONTRIBUTING.md', ...MANIFESTS],
  'single-frogbot': MANIFESTS,
  tests: ['test/**', 'packages/**/src/**', 'vitest.config.ts'],
  'ticket-docs': [],
  'ui-architecture': ['packages/ui/src/**'],
};

// These check the shape of code (import paths, file layout), not what it does, so they run for a
// file without covering it.
const STRUCTURAL_CHECKS = ['dist-imports', 'tests', 'ui-architecture'];

// Verify runs the groups in this order and stops at the first that fails. Passing every group
// with a level reaches the highest of those levels; browser projects add no level of their own.
export const GROUPS = [
  { group: 'typecheck', level: 'typecheck' },
  { group: 'checks', level: 'typecheck' },
  { group: 'unit', level: 'unit' },
  { group: 'ui', level: 'unit' },
  { group: 'int', level: 'int' },
  { group: 'browser', level: null },
];

const LEVELS = ['typecheck', 'unit', 'int'];

const PROJECT_GROUPS = { unit: 'unit', 'gateway-unit': 'unit', ui: 'ui', int: 'int' };

export function affectedRuns(files) {
  return RUNS.filter(({ prefixes, pattern }) =>
    files.some((file) => prefixes.some((prefix) => file.startsWith(prefix)) || pattern?.test(file)),
  ).map(({ script }) => script);
}

export function docsOnly(files) {
  return files.length > 0 && files.every((file) => DOCS.test(file));
}

export function markdownSpecs(specs) {
  return specs
    .filter(({ file, text }) => UNIT_SPEC.test(file) && READS_MARKDOWN.test(text))
    .map(({ file }) => file)
    .sort();
}

export function landGates({ base, files, specs }) {
  if (!docsOnly(files)) return [...base, ...affectedRuns(files)];

  const readers = markdownSpecs(specs);

  return [
    ...base.filter((gate) => !gate.startsWith('test:')),
    ...(readers.length > 0 ? [`test:unit ${readers.join(' ')}`] : []),
  ];
}

export function typecheckAreas({ dir, text }) {
  return [...text.matchAll(/\barea:\s*'([^']+)',\s*project:\s*'([^']+)'/g)].map(
    ([, area, project]) => ({ area, dir: path.posix.dirname(path.posix.join(dir, project)) }),
  );
}

export function testTypeDirs(script) {
  return [
    ...new Set(
      [...(script ?? '').matchAll(/\btest\/types\/([^/\s]+)\//g)].map(
        ([, dir]) => `test/types/${dir}`,
      ),
    ),
  ];
}

function inside(file, dir) {
  return file.startsWith(`${dir}/`);
}

function ownerOf(file, packages) {
  return packages
    .filter(({ dir }) => dir && inside(file, dir))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
}

function folderOf({ dir }) {
  return path.posix.basename(dir);
}

function sourcePath(file, pkg) {
  return pkg && inside(file, `${pkg.dir}/src`) ? file.slice(pkg.dir.length + 5) : null;
}

function areaOfSource(source, areas) {
  const first = source.split('/')[0];

  return areas.find(
    ({ area, dir }) => dir.startsWith('test/') && (first === area || first === `${area}s`),
  )?.area;
}

function typecheckSet({ files, packages, cover }) {
  const selected = new Map();

  const add = (pkg, area) => {
    if (!pkg?.typecheck) return false;

    if (!selected.has(pkg.name)) selected.set(pkg.name, { pkg, areas: new Set() });

    if (area && pkg.areas) selected.get(pkg.name).areas.add(area);

    return true;
  };

  for (const file of files) {
    const owner = ownerOf(file, packages);

    if (owner && add(owner, 'source')) {
      const source = sourcePath(file, owner);
      const area = source && owner.areas && areaOfSource(source, owner.areas);

      if (area) add(owner, area);
    }

    const typeTest = TYPE_TEST.exec(file);

    if (typeTest) {
      const pkg = packages.find((candidate) => folderOf(candidate) === typeTest[1]);

      if (add(pkg, 'typetest')) cover(file);
    }

    for (const pkg of packages) {
      const area = pkg.areas?.find(({ dir }) => dir.startsWith('test/') && inside(file, dir));

      if (area && add(pkg, area.area)) cover(file);
      else if (pkg.typeTests?.some((dir) => inside(file, dir)) && add(pkg)) cover(file);
    }
  }

  return [...selected.values()]
    .map(({ pkg, areas }) => ({
      name: pkg.name,
      areas: pkg.areas
        ? pkg.areas
            .map(({ area }) => area)
            .filter((area, index, all) => all.indexOf(area) === index && areas.has(area))
        : [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mirrors(file, packages) {
  const pkg = ownerOf(file, packages);
  const source = sourcePath(file, pkg);

  if (!source) return null;

  const folder = folderOf(pkg);
  const stem = source.replace(/\.[^/]*$/, '');
  const base = path.posix.basename(stem);
  const stems = base === 'index' || base.startsWith('index.') ? [path.posix.dirname(stem)] : [stem];
  const units = ['unit', 'ui'].flatMap((kind) =>
    stems.filter((name) => name !== '.').map((name) => `test/${kind}/${folder}/${name}`),
  );

  return {
    unit: (spec) => units.some((prefix) => spec.startsWith(`${prefix}.`) || inside(spec, prefix)),
    int: (spec) => inside(spec, `test/${pkg.name === 'frogbot' ? source.split('/')[0] : folder}`),
  };
}

function specSet({ files, packages, vitest, related, runs, cover }) {
  const selected = Object.fromEntries(vitest.map(({ name }) => [name, new Set()]));

  const add = (project, spec, sources) => {
    const gated = PROJECT_GROUPS[project] === 'int' && !runs.includes('test:int:sqlite');

    if (!selected[project] || gated) return;

    selected[project].add(spec);
    sources.forEach(cover);
  };

  for (const { name, specs } of vitest) {
    for (const file of files) {
      if (specs.includes(file)) add(name, file, [file]);

      const mirror = mirrors(file, packages);

      if (!mirror) continue;

      const matches = specs.filter(PROJECT_GROUPS[name] === 'int' ? mirror.int : mirror.unit);

      matches.forEach((spec) => add(name, spec, [file]));
    }
  }

  for (const { project, spec, sources } of related) add(project, spec, sources);

  return Object.fromEntries(
    Object.entries(selected).map(([project, specs]) => [project, [...specs].sort()]),
  );
}

function browserSet({ files, packages, browser, runs, cover }) {
  if (!browser || !runs.includes('test:browser')) return [];

  const selected = new Set();

  for (const file of files) {
    const owner = ownerOf(file, packages);
    const everything = browser.infrastructure.includes(file);

    for (const project of browser.projects) {
      const hit =
        everything ||
        project.specs.some((spec) => spec === file || browser.imports[spec]?.includes(file)) ||
        inside(file, project.fixture) ||
        Boolean(owner && browser.fixturePackages[project.fixture]?.includes(owner.name));

      if (hit) {
        selected.add(project.name);
        cover(file);
      }
    }
  }

  return browser.projects.map(({ name }) => name).filter((name) => selected.has(name));
}

function checkSet({ files, checks, cover }) {
  return checks.filter((name) => {
    const read = files.filter(
      (file) =>
        file === `scripts/check-${name}.mjs` ||
        (CHECK_INPUTS[name] ?? []).some((glob) => path.posix.matchesGlob(file, glob)),
    );

    if (!STRUCTURAL_CHECKS.includes(name)) read.forEach(cover);

    return read.length > 0;
  });
}

// Maps changed files to what covers them. `packages` are workspace packages ({ name, dir,
// typecheck, typeTests, areas }), `vitest` lists each project's specs, `related` gives each spec
// the changed files in its import graph, and `browser` holds the Playwright projects, the files
// every project depends on, each spec's imports and each fixture's workspace packages. Typecheck
// alone covers only type tests: a source file nothing else exercises is listed as uncovered.
export function affectedSet({ files, packages, vitest = [], related = [], browser, checks = [] }) {
  const runs = affectedRuns(files);
  const covered = new Set();
  const cover = (file) => covered.add(file);
  const specs = specSet({ files, packages, vitest, related, runs, cover });

  return {
    typecheck: typecheckSet({ files, packages, cover }),
    checks: checkSet({ files, checks, cover }),
    specs,
    browser: browserSet({ files, packages, browser, runs, cover }),
    uncovered: files.filter((file) => !covered.has(file)),
  };
}

function projectCommand(project, specs) {
  const script = { unit: 'test:unit', ui: 'test:ui', int: 'test:int:sqlite' }[project];

  return script
    ? ['pnpm', script, ...specs]
    : ['pnpm', 'exec', 'vitest', 'run', '--project', project, ...specs];
}

export function verifyGroups(set) {
  const commands = {
    typecheck: set.typecheck.map(({ name, areas }) => [
      'pnpm',
      '--filter',
      name,
      'typecheck',
      ...areas,
    ]),
    checks: set.checks.map((name) => ['pnpm', 'check', name]),
    browser:
      set.browser.length > 0
        ? [['pnpm', 'test:browser', ...set.browser.flatMap((name) => ['--project', name])]]
        : [],
  };

  for (const [project, specs] of Object.entries(set.specs)) {
    if (specs.length === 0) continue;

    const group = PROJECT_GROUPS[project];

    commands[group] = [...(commands[group] ?? []), projectCommand(project, specs)];
  }

  return GROUPS.map(({ group, level }) => ({
    group,
    level,
    commands: commands[group] ?? [],
  })).filter(({ commands: list }) => list.length > 0);
}

export function levelReached(groups) {
  const levels = groups.map(({ level }) => level).filter(Boolean);

  return LEVELS.findLast((level) => levels.includes(level)) ?? null;
}

function specArgs(args) {
  return args.filter((arg) => arg.startsWith('test/'));
}

export function commandName(args) {
  return args.filter((arg) => !arg.startsWith('test/')).join(' ');
}

export function groupSize({ group, commands }) {
  if (group === 'typecheck') return commands.map((args) => args[2]).join(', ');

  if (group === 'checks') return commands.map((args) => args.at(-1)).join(', ');

  if (group === 'browser') {
    return commands[0].filter((arg, index, all) => all[index - 1] === '--project').join(', ');
  }

  const specs = commands.flatMap(specArgs).length;

  return `${specs} ${specs === 1 ? 'spec' : 'specs'}`;
}

function column(label, width) {
  return label.padEnd(width);
}

export function formatList({ tier, groups, uncovered }) {
  const width = Math.max('uncovered'.length, ...groups.map(({ group }) => group.length));
  const out = [`tier: ${tier}`];

  for (const { group, commands } of groups) {
    for (const [index, args] of commands.entries()) {
      const specs = specArgs(args);
      const count = specs.length > 0 ? ` (${specs.length})` : '';

      out.push(`${column(index === 0 ? group : '', width)}  ${commandName(args)}${count}`);
      out.push(...specs.map((spec) => `${column('', width)}    ${spec}`));
    }
  }

  if (groups.length === 0) {
    out.push(`${column('nothing', width)}  no check or test covers this diff`);
  }

  return [...out, ...formatUncovered(uncovered, width)];
}

export function formatUncovered(uncovered, width = 'uncovered'.length) {
  if (uncovered.length === 0) return [`${column('uncovered', width)}  none`];

  return uncovered.map(
    (file, index) => `${column(index === 0 ? 'uncovered' : '', width)}  ${file}`,
  );
}

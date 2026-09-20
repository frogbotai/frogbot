import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const testRoot = join(repo, 'test/unit/scripts');
const pluginPath = '.claude-plugin/plugin.json';
const marketplacePath = '.claude-plugin/marketplace.json';
const skillPath = 'skills/frogbot/SKILL.md';
const metadata = "metadata:\n  author: 'frogbotai'\n  version: '0.24.0'";
const skill = [
  '---',
  'name: frogbot',
  'description: >-',
  '  Builds FrogBot applications.',
  '  Keep this multiline description.',
  'version: "unrelated top-level version"',
  metadata,
  'license: MIT',
  '---',
  '',
  '# FrogBot',
  '```yaml',
  metadata,
  '```',
  '[Reference](reference/REFERENCE.md)',
  'https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/REFERENCE.md',
  '',
].join('\n');
const packagePaths = [
  'package.json',
  'packages/frogbot/package.json',
  'packages/plugins/plugin-test/package.json',
  'packages/pieces/piece-test/package.json',
  'examples/app/package.json',
  'templates/blank/package.json',
];
const dependencies = {
  dependencies: { frogbot: '^0.20.0', external: '^9.1.0', ignored: '^8.0.0' },
  devDependencies: { '@frogbotai/plugin-test': '~0.20.0', frogbot: 'workspace:*' },
  peerDependencies: { frogbot: '>=0.20.0', '@frogbotai/plugin-test': 'workspace:^' },
  optionalDependencies: { '@frogbotai/piece-test': '0.20.0', frogbot: 'workspace:~' },
};
const plugin = {
  name: 'frogbot',
  version: '0.24.0',
  description: 'FrogBot development skill',
  author: { name: 'FrogBot' },
};
const marketplace = {
  name: 'frogbot',
  owner: { name: 'FrogBot' },
  metadata: { version: 'leave alone' },
  plugins: [
    { name: 'other', version: '8.7.6', source: './other' },
    { name: 'frogbot', version: '0.24.0', source: './', description: 'Keep me' },
    { name: 'last', version: '1.2.3', source: './last' },
  ],
};

let temporary: string;
let root: string;
let caller: string;
let originalRoot: Buffer;

function write(file: string, content: string) {
  const target = join(root, file);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeJSON(file: string, value: unknown) {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJSON(file: string) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}

function snapshot(directory: string): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, snapshot(file));
    } else {
      files[file] = readFileSync(file);
    }
  }

  return files;
}

function run(args = ['patch']) {
  const script = join(root, 'scripts/bump.mjs');

  expect(realpathSync(script)).toBe(script);
  expect(root.startsWith(`${realpathSync(testRoot)}${sep}`)).toBe(true);
  expect(readFileSync(script)).toEqual(readFileSync(join(repo, 'scripts/bump.mjs')));

  return spawnSync(process.execPath, [script, ...args], {
    cwd: caller,
    encoding: 'utf8',
    timeout: 10000,
  });
}

function expectFailure({ args, diagnostic }: { args?: string[]; diagnostic: string }) {
  const before = snapshot(temporary);

  const result = run(args);

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(diagnostic);
  expect(result.stdout).not.toContain('Bumping');
  expect(snapshot(temporary)).toEqual(before);
}

beforeEach(async () => {
  originalRoot = readFileSync(join(repo, 'package.json'));
  temporary = realpathSync(mkdtempSync(join(testRoot, '.bump-')));
  root = join(temporary, 'repository');
  caller = join(temporary, 'caller');

  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  mkdirSync(caller);

  for (const file of ['scripts/bump.mjs', 'scripts/lib/workspace.mjs']) {
    copyFileSync(join(repo, file), join(root, file));

    assert.deepEqual(readFileSync(join(root, file)), readFileSync(join(repo, file)));
  }

  const helperURL = pathToFileURL(join(root, 'scripts/lib/workspace.mjs')).href;
  const helper = await import(helperURL);

  assert.strictEqual(helper.ROOT, root);
  assert.notStrictEqual(helper.ROOT, resolve(repo));

  const names = [
    'fixture-root',
    'frogbot',
    '@frogbotai/plugin-test',
    '@frogbotai/piece-test',
    'example-app',
    'template-blank',
  ];

  for (const [index, file] of packagePaths.entries()) {
    writeJSON(file, { name: names[index], version: '0.24.0', sentinel: file, ...dependencies });
  }

  writeJSON(pluginPath, plugin);
  writeJSON(marketplacePath, marketplace);
  write(skillPath, skill);
  write('skills/frogbot/reference/REFERENCE.md', `${metadata}\r\nReference bytes: é 🐸\r\n`);
  write('examples/README.md', 'Not a consumer package.\n');
  writeJSON('packages/node_modules/ignored/package.json', { name: 'ignored', version: '8.0.0' });
  writeJSON('packages/plugins/node_modules/ignored/package.json', { version: '9.0.0' });
  writeFileSync(join(caller, 'package.json'), '{"version":"99.99.99"}\n');
});

afterEach(() => {
  rmSync(temporary, { recursive: true, force: true });

  assert.deepEqual(readFileSync(join(repo, 'package.json')), originalRoot);
});

describe('bump', () => {
  it.each([
    ['major', '1.0.0'],
    ['minor', '0.25.0'],
    ['patch', '0.24.1'],
  ])('updates packages and all distribution versions for %s', (kind, next) => {
    const references = snapshot(join(root, 'skills/frogbot/reference'));

    const result = run([kind]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('6 package.json files and 3 distribution files updated.');

    for (const file of packagePaths) {
      expect(readJSON(file)).toEqual({
        name: expect.any(String),
        version: next,
        sentinel: file,
        dependencies: { frogbot: next, external: '^9.1.0', ignored: '^8.0.0' },
        devDependencies: { '@frogbotai/plugin-test': next, frogbot: 'workspace:*' },
        peerDependencies: { frogbot: next, '@frogbotai/plugin-test': 'workspace:^' },
        optionalDependencies: { '@frogbotai/piece-test': next, frogbot: 'workspace:~' },
      });
    }

    expect(readJSON(pluginPath)).toEqual({ ...plugin, version: next });
    expect(readJSON(marketplacePath)).toEqual({
      ...marketplace,
      plugins: [
        marketplace.plugins[0],
        { ...marketplace.plugins[1], version: next },
        marketplace.plugins[2],
      ],
    });
    expect(readFileSync(join(root, skillPath), 'utf8')).toBe(
      skill.replace("version: '0.24.0'", `version: '${next}'`),
    );
    expect(snapshot(join(root, 'skills/frogbot/reference'))).toEqual(references);
    expect(readJSON('packages/node_modules/ignored/package.json').version).toBe('8.0.0');
    expect(readJSON('packages/plugins/node_modules/ignored/package.json').version).toBe('9.0.0');
    expect(readFileSync(join(caller, 'package.json'), 'utf8')).toBe('{"version":"99.99.99"}\n');
  });

  it.each([
    { quote: "'", ending: 'LF', eol: '\n' },
    { quote: '"', ending: 'LF', eol: '\n' },
    { quote: "'", ending: 'CRLF', eol: '\r\n' },
    { quote: '"', ending: 'CRLF', eol: '\r\n' },
  ])('preserves $quote quotes, $ending, and all non-version skill bytes', ({ quote, eol }) => {
    const content = skill.replaceAll("'0.24.0'", `${quote}0.24.0${quote}`).replaceAll('\n', eol);

    write(skillPath, content);

    const result = run();

    expect(result.status).toBe(0);
    expect(readFileSync(join(root, skillPath))).toEqual(
      Buffer.from(content.replace(`${quote}0.24.0${quote}`, `${quote}0.24.1${quote}`)),
    );
  });

  it('preserves the delivered skill body and every reference byte', () => {
    rmSync(join(root, 'skills/frogbot'), { recursive: true });
    cpSync(join(repo, 'skills/frogbot'), join(root, 'skills/frogbot'), { recursive: true });

    const original = readFileSync(join(root, skillPath), 'utf8');
    const references = snapshot(join(root, 'skills/frogbot/reference'));
    const version = JSON.parse(originalRoot.toString()).version;

    expect(Object.keys(references)).toHaveLength(23);
    expect(original).toContain(`  version: '${version}'`);

    const result = run();

    expect(result.status).toBe(0);
    expect(readFileSync(join(root, skillPath))).toEqual(
      Buffer.from(original.replace(`  version: '${version}'`, "  version: '0.24.1'")),
    );
    expect(snapshot(join(root, 'skills/frogbot/reference'))).toEqual(references);
  });

  it.each([
    { current: '12.34.56', kind: 'major', next: '13.0.0' },
    { current: '12.34.56', kind: 'minor', next: '12.35.0' },
    { current: '12.34.56', kind: 'patch', next: '12.34.57' },
    { current: '01.02.03', kind: 'patch', next: '1.2.4' },
  ])('retains $kind parsing for root version $current', ({ current, kind, next }) => {
    writeJSON('package.json', { name: 'fixture-root', version: current });

    const result = run([kind]);

    expect(result.status).toBe(0);
    expect(readJSON('package.json').version).toBe(next);
    expect(readJSON(pluginPath).version).toBe(next);
    expect(readJSON(marketplacePath).plugins[1].version).toBe(next);
    expect(readFileSync(join(root, skillPath), 'utf8')).toBe(
      skill.replace("version: '0.24.0'", `version: '${next}'`),
    );
  });

  it('retains already pinned and non-string dependency values', () => {
    const manifest = {
      name: 'fixture-root',
      version: '0.24.0',
      dependencies: {
        frogbot: '0.24.1',
        '@frogbotai/plugin-test': null,
        '@frogbotai/piece-test': 24,
        'example-app': '^0.20.0',
        'template-blank': '^0.20.0',
      },
    };

    writeJSON('package.json', manifest);

    const result = run();

    expect(result.status).toBe(0);
    expect(readJSON('package.json')).toEqual({ ...manifest, version: '0.24.1' });
    expect(result.stdout).not.toContain('frogbot@0.24.1->0.24.1');
  });

  it('preserves an existing unrelated marketplace top-level version', () => {
    writeJSON(marketplacePath, { ...marketplace, version: '7.0.0' });

    const result = run();

    expect(result.status).toBe(0);
    expect(readJSON(marketplacePath).version).toBe('7.0.0');
    expect(readJSON(marketplacePath).plugins[1].version).toBe('0.24.1');
  });

  it.each([pluginPath, marketplacePath, skillPath])('rejects missing %s before writing', (file) => {
    rmSync(join(root, file));

    expectFailure({ diagnostic: file });
  });

  it.each([...packagePaths, pluginPath, marketplacePath])(
    'rejects invalid JSON in %s before writing',
    (file) => {
      write(file, '{ invalid JSON');

      expectFailure({ diagnostic: `${file}: expected a readable JSON object` });
    },
  );

  it.each([
    { file: pluginPath, value: null },
    { file: pluginPath, value: [] },
    { file: pluginPath, value: 'invalid' },
    { file: pluginPath, value: 42 },
    { file: marketplacePath, value: null },
    { file: marketplacePath, value: [] },
    { file: marketplacePath, value: 'invalid' },
    { file: marketplacePath, value: 42 },
  ])('rejects a non-object manifest in $file: $value', ({ file, value }) => {
    writeJSON(file, value);

    expectFailure({ diagnostic: `${file}: expected a JSON object` });
  });

  it('rejects an incorrectly named plugin', () => {
    writeJSON(pluginPath, { ...plugin, name: 'other' });

    expectFailure({ diagnostic: `${pluginPath}: expected name "frogbot"` });
  });

  it.each([
    {},
    { plugins: {} },
    { plugins: [] },
    { plugins: [null, { name: 'other' }] },
    { plugins: [{ name: 'frogbot' }, { name: 'frogbot' }] },
  ])('rejects missing or duplicate named marketplace entries: %j', (value) => {
    writeJSON(marketplacePath, value);

    expectFailure({
      diagnostic: `${marketplacePath}: plugins must contain exactly one entry named "frogbot"`,
    });
  });

  it.each([
    ['missing opening delimiter', skill.slice(4)],
    ['frontmatter after body', `Preface\n${skill}`],
    ['missing closing delimiter', skill.replace('\n---\n\n', '\n\n')],
  ])('rejects %s', (_name, content) => {
    write(skillPath, content);

    expectFailure({
      diagnostic: `${skillPath}: expected leading frontmatter enclosed by --- lines`,
    });
  });

  it.each([
    ['missing metadata', 'license: MIT'],
    ['duplicate metadata', `${metadata}\n${metadata}`],
    ['flow metadata', "metadata: { version: '0.24.0' }"],
    ['indented metadata', "  metadata:\n    version: '0.24.0'"],
    ['quoted metadata', "'metadata':\n  version: '0.24.0'"],
  ])('rejects %s without using the body decoy', (_name, replacement) => {
    write(skillPath, skill.replace(metadata, replacement));

    expectFailure({ diagnostic: `${skillPath}: expected exactly one top-level metadata: mapping` });
  });

  it.each([
    ['missing version', "metadata:\n  author: 'frogbotai'"],
    ['duplicate version', `${metadata}\n  version: '0.24.0'`],
    ['quoted duplicate key', `${metadata}\n  'version': '0.24.0'`],
    ['unquoted version', 'metadata:\n  version: 0.24.0'],
    ['wrong indentation', "metadata:\n    version: '0.24.0'"],
    ['tab indentation', "metadata:\n\tversion: '0.24.0'"],
    ['wrong mapping', "metadata:\n  author: 'frogbotai'\nother:\n  version: '0.24.0'"],
    ['mismatched quotes', 'metadata:\n  version: \'0.24.0"'],
    ['multiline version', "metadata:\n  version: >-\n    '0.24.0'"],
    ['empty version', "metadata:\n  version: ''"],
    ['non-version string', "metadata:\n  version: 'latest'"],
    ['quoted key', "metadata:\n  'version': '0.24.0'"],
  ])('rejects %s before writing any package', (_name, replacement) => {
    write(skillPath, skill.replace(metadata, replacement));

    expectFailure({
      diagnostic: `${skillPath}: metadata.version must be exactly one two-space-indented quoted x.y.z scalar`,
    });
  });

  it.each([{ args: [] }, { args: ['invalid'] }, { args: ['PATCH'] }, { args: ['0.25.0'] }])(
    'rejects invalid release arguments: $args',
    ({ args }) => {
      expectFailure({ args, diagnostic: 'Usage: pnpm bump <major|minor|patch>' });
    },
  );

  it.each(['0.24', 'v0.24.0', '0.24.0-beta.1', 'latest', 24])(
    'rejects invalid root version %j',
    (version) => {
      writeJSON('package.json', { name: 'fixture-root', version });

      expectFailure({ diagnostic: 'root package.json version' });
    },
  );

  it('rejects a missing root version', () => {
    writeJSON('package.json', { name: 'fixture-root' });

    expectFailure({ diagnostic: 'Root package.json has no "version" field' });
  });
});

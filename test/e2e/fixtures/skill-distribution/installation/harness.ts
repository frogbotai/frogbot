import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { expect } from 'vitest';

export const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
export const cliRoot = path.join(repoRoot, 'packages/create-frogbot-app');
export const canonicalSkill = path.join(repoRoot, 'skills/frogbot');
export const skillsClient = process.env.SKILL_DISTRIBUTION_SKILLS_BIN;
export const claudeClient = process.env.SKILL_DISTRIBUTION_CLAUDE_BIN;
export const skillsAgents = [
  'claude-code',
  'codex',
  'cursor',
  'opencode',
  'github-copilot',
  'gemini-cli',
];
export const projectAgents = 'claude,codex,cursor,opencode,copilot,gemini';
export const skillTargets = ['.claude/skills/frogbot', '.agents/skills/frogbot'];
export const pointers = [
  { file: 'CLAUDE.md', target: '.claude/skills/frogbot', heading: 'Claude Code' },
  { file: 'AGENTS.md', target: '.agents/skills/frogbot', heading: 'Agents' },
  {
    file: '.github/copilot-instructions.md',
    target: '.agents/skills/frogbot',
    heading: 'GitHub Copilot Instructions',
  },
  { file: 'GEMINI.md', target: '.agents/skills/frogbot', heading: 'Gemini' },
];

export const inventory = [
  'SKILL.md',
  ...[
    'ACCESS-CONTROL-ADVANCED',
    'ACCESS-CONTROL',
    'ADAPTERS',
    'ADVANCED',
    'AGENTS',
    'AI',
    'CHAT-UI',
    'COLLECTIONS',
    'CONNECTIONS',
    'ENDPOINTS',
    'ENV',
    'FIELD-TYPE-GUARDS',
    'FIELDS',
    'GATEWAY',
    'HOOKS',
    'JOBS',
    'KV',
    'MCP',
    'PIECES',
    'PLUGIN-DEVELOPMENT',
    'PLUGINS-ROLES-KEYS',
    'QUERIES',
    'TOOLS',
  ].map((name) => `reference/${name}.md`),
].sort();

export interface InstallationFixture {
  root: string;
  project: string;
  repository: string;
  env: NodeJS.ProcessEnv;
}

export function readJSON<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export const packageVersion = readJSON<{ version: string }>(
  path.join(repoRoot, 'package.json'),
).version;

export function createFixture(): InstallationFixture {
  const parent = path.join(repoRoot, 'test/.tmp');

  expect(fs.statSync(path.dirname(parent)).isDirectory()).toBe(true);
  fs.mkdirSync(parent, { recursive: true });

  const root = fs.mkdtempSync(path.join(parent, 'skill-installation-'));
  const project = path.join(root, 'project');
  const repository = path.join(root, 'repository');
  const locations = {
    HOME: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'config'),
    XDG_CACHE_HOME: path.join(root, 'cache'),
    XDG_DATA_HOME: path.join(root, 'data'),
    XDG_STATE_HOME: path.join(root, 'state'),
    XDG_RUNTIME_DIR: path.join(root, 'runtime'),
    XDG_CONFIG_DIRS: path.join(root, 'system-config'),
    XDG_DATA_DIRS: path.join(root, 'system-data'),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
    CODEX_HOME: path.join(root, 'codex'),
    TMPDIR: path.join(root, 'tmp'),
    npm_config_cache: path.join(root, 'npm-cache'),
  };

  for (const directory of [project, repository, ...Object.values(locations)]) {
    expect(path.relative(root, directory)).not.toMatch(/^\.\./);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  const env: NodeJS.ProcessEnv = {
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    ...locations,
    USERPROFILE: locations.HOME,
    TMP: locations.TMPDIR,
    TEMP: locations.TMPDIR,
    CI: '1',
    NO_COLOR: '1',
    TERM: 'dumb',
    DISABLE_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
    DISABLE_ERROR_REPORTING: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
    GIT_TERMINAL_PROMPT: '0',
    npm_config_userconfig: path.join(root, 'npmrc'),
    npm_config_globalconfig: path.join(root, 'global-npmrc'),
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  };

  expect(
    Object.keys(env).filter((key) => /TOKEN|SECRET|API_KEY|AUTH|CREDENTIAL/.test(key)),
  ).toEqual([]);

  fs.cpSync(path.join(repoRoot, '.claude-plugin'), path.join(repository, '.claude-plugin'), {
    recursive: true,
  });
  fs.cpSync(canonicalSkill, path.join(repository, 'skills/frogbot'), { recursive: true });

  return { root, project, repository, env };
}

export function run(
  fixture: InstallationFixture,
  executable: string,
  args: string[],
  cwd = fixture.project,
) {
  const result = spawnSync(executable, args, {
    cwd,
    env: fixture.env,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = stripVTControlCharacters(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  const diagnostic = `${executable} ${args.join(' ')}\ncwd: ${cwd}\n${output}`;

  expect(result.error, diagnostic).toBeUndefined();
  expect(result.signal, diagnostic).toBeNull();

  return { status: result.status, output, stdout: result.stdout, diagnostic };
}

export function successful(
  fixture: InstallationFixture,
  executable: string,
  args: string[],
  cwd = fixture.project,
) {
  const result = run(fixture, executable, args, cwd);

  expect(result.status, result.diagnostic).toBe(0);

  return result;
}

export function clientVersion(fixture: InstallationFixture, executable: string): string {
  expect(path.isAbsolute(executable), 'Provide an absolute prepared client executable path').toBe(
    true,
  );
  fs.accessSync(executable, fs.constants.X_OK);

  const result = successful(fixture, executable, ['--version']);
  const version = result.output.match(/\b\d+\.\d+\.\d+\b/)?.[0];

  expect(version, result.diagnostic).toBeDefined();
  console.info(`Prepared distribution client: ${executable} (${version})`);

  return version!;
}

export function expectInstalledAgents(fixture: InstallationFixture): void {
  const result = successful(fixture, skillsClient!, ['list', '--json', '--agent', ...skillsAgents]);
  const installed = JSON.parse(result.stdout) as {
    name: string;
    scope: string;
    agents: string[];
  }[];

  expect(installed, result.diagnostic).toHaveLength(1);
  expect(installed[0]).toMatchObject({ name: 'frogbot', scope: 'project' });
  expect(installed[0].agents.sort()).toEqual(
    ['Claude Code', 'Codex', 'Cursor', 'OpenCode', 'GitHub Copilot', 'Gemini CLI'].sort(),
  );
}

export function files(directory: string): string[] {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

export function expectFullSkill(directory: string): void {
  expect(files(canonicalSkill)).toEqual(inventory);
  expect(files(directory)).toEqual(inventory);
  expect(inventory).toHaveLength(24);

  for (const file of inventory) {
    const installed = path.join(directory, file);

    expect(fs.lstatSync(installed).isFile(), installed).toBe(true);
    expect(fs.readFileSync(installed), installed).toEqual(
      fs.readFileSync(path.join(canonicalSkill, file)),
    );
  }

  const entry = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8');
  const frontmatter = entry.split('---')[1];

  expect(frontmatter).toMatch(/^name: frogbot$/m);
  expect(frontmatter.match(/^ {2}version: ["'](.+)["']$/m)?.[1]).toBe(packageVersion);
}

export function expectProjectSkill(project: string): void {
  for (const target of skillTargets) {
    const directory = path.join(project, target);

    expect(fs.lstatSync(directory).isDirectory()).toBe(true);
    expectFullSkill(directory);
  }

  for (const { file, heading, target } of pointers) {
    const pointer = fs.readFileSync(path.join(project, file), 'utf8');

    expect(pointer.match(/^# /gm), file).toHaveLength(1);
    expect(pointer).toContain(`# ${heading}\n`);
    expect(pointer.match(/Start with/g), file).toHaveLength(1);
    expect(pointer).toContain(`\`${target}/SKILL.md\``);
    expect(pointer).toContain(`\`${target}/reference/\``);
    expect(fs.statSync(path.join(project, target, 'SKILL.md')).isFile()).toBe(true);
    expect(fs.readdirSync(path.join(project, target, 'reference'))).toHaveLength(23);
  }
}

export function expectNoProjectSkill(project: string): void {
  for (const file of [...skillTargets, ...pointers.map((pointer) => pointer.file)]) {
    expect(fs.existsSync(path.join(project, file)), file).toBe(false);
  }

  expect(fs.existsSync(path.join(project, '.claude'))).toBe(false);
  expect(fs.existsSync(path.join(project, '.agents'))).toBe(false);
}

export function expectScaffold(project: string): void {
  const pkg = readJSON<{ name: string; dependencies: Record<string, string> }>(
    path.join(project, 'package.json'),
  );
  const dependencies = Object.entries(pkg.dependencies).filter(
    ([name]) => name === 'frogbot' || name.startsWith('@frogbotai/'),
  );

  expect(pkg.name).toBe(path.basename(project));
  expect(dependencies.length).toBeGreaterThan(0);

  for (const [name, version] of dependencies) {
    expect(version, name).toBe(`^${packageVersion}`);
  }

  expect(fs.existsSync(path.join(project, 'src/frogbot.config.ts'))).toBe(true);
  expect(fs.existsSync(path.join(project, '.git'))).toBe(false);
  expect(fs.existsSync(path.join(project, 'node_modules'))).toBe(false);
}

export function packCLI(fixture: InstallationFixture): string {
  const pkg = readJSON<{ scripts: Record<string, string>; version: string }>(
    path.join(cliRoot, 'package.json'),
  );

  expect(pkg.version).toBe(packageVersion);

  for (const hook of ['prepack', 'prepare', 'postpack']) {
    expect(
      pkg.scripts[hook],
      `Pack hook ${hook} requires coordinator inspection before running`,
    ).toBeUndefined();
  }

  expectFullSkill(path.join(cliRoot, 'dist/skills/frogbot'));

  const tarballs = path.join(fixture.root, 'tarballs');

  fs.mkdirSync(tarballs);

  const version = successful(fixture, 'pnpm', ['--version'], cliRoot);

  console.info(`Distribution pack pnpm: ${version.stdout.trim()}`);
  successful(fixture, 'pnpm', ['pack', '--pack-destination', tarballs, '--json'], cliRoot);

  const archives = fs.readdirSync(tarballs);

  expect(archives).toEqual([`create-frogbot-app-${packageVersion}.tgz`]);

  return path.join(tarballs, archives[0]);
}

export function extractCLI(fixture: InstallationFixture, tarball: string): string {
  const extracted = path.join(fixture.root, 'packed');

  fs.mkdirSync(extracted);
  successful(fixture, 'tar', ['-xzf', tarball, '-C', extracted]);

  const packed = path.join(extracted, 'package');

  expect(fs.existsSync(path.join(packed, 'node_modules'))).toBe(false);
  expect(fs.statSync(path.join(cliRoot, 'node_modules')).isDirectory()).toBe(true);
  fs.symlinkSync(path.join(cliRoot, 'node_modules'), path.join(packed, 'node_modules'), 'dir');

  return packed;
}

export function scaffold(fixture: InstallationFixture, packed: string, flags: string[]): string {
  const name = 'skill-contract';

  successful(fixture, process.execPath, [
    path.join(packed, 'bin.js'),
    name,
    '--yes',
    '--no-install',
    '--no-git',
    ...flags,
  ]);

  return path.join(fixture.project, name);
}

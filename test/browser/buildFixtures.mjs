import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..', '..');
const frogbotBin = path.join(repoRoot, 'packages', 'frogbot', 'bin.js');
const pushSchemaScript = path.join(dirname, 'pushSchema.ts');
const concurrentBuilds = 2;

const sharedInputs = [
  fileURLToPath(import.meta.url),
  pushSchemaScript,
  path.join(repoRoot, 'pnpm-lock.yaml'),
  path.join(repoRoot, 'tsconfig.base.json'),
];

const fixtures = JSON.parse(process.env.FROGBOT_BROWSER_FIXTURES ?? '[]');
const children = new Set();
const locks = new Set();

const buildDir = (dir) => path.join(dir, '.next', 'frogbot-browser');

const sha = (content) => createHash('sha256').update(content).digest('hex');

const readJSON = (file) => readFile(file, 'utf8').then(JSON.parse);

const fixtureFiles = (dir) =>
  execFileSync('git', ['ls-files', '-coz', '--exclude-standard'], { cwd: dir, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .sort();

const packageRoot = (dir) =>
  existsSync(path.join(dir, 'node_modules')) ? dir : packageRoot(path.dirname(dir));

const workspaceDependencies = (manifest, fields) =>
  fields.flatMap((field) =>
    Object.entries(manifest[field] ?? {})
      .filter(([, version]) => version.startsWith('workspace:'))
      .map(([name]) => name),
  );

const runtimeFields = ['dependencies', 'peerDependencies', 'optionalDependencies'];

const workspacePackages = async (
  dir,
  fields = ['devDependencies', ...runtimeFields],
  seen = new Map(),
) => {
  const manifest = await readJSON(path.join(dir, 'package.json'));

  for (const name of workspaceDependencies(manifest, fields)) {
    const packageDir = await realpath(path.join(dir, 'node_modules', name)).catch(() => null);

    if (!packageDir || seen.has(packageDir)) continue;

    seen.set(packageDir, name);
    await workspacePackages(packageDir, runtimeFields, seen);
  }

  return seen;
};

const packageFingerprint = async ([packageDir, name]) => {
  const stamp = path.join(packageDir, 'node_modules', '.cache', 'frogbot-build', 'stamp.json');
  const { outputs } = await readJSON(stamp).catch(() => ({ outputs: 'unbuilt' }));
  const manifest = await readFile(path.join(packageDir, 'package.json'));

  return `${name}@${outputs}:${sha(manifest)}`;
};

const fingerprint = async ({ dir, env }) => {
  const files = fixtureFiles(dir).filter((file) => path.basename(file) !== 'importMap.js');

  const [fixtureContents, shared, packages] = await Promise.all([
    Promise.all(files.map((file) => readFile(path.join(dir, file)).catch(() => 'missing'))),
    Promise.all(sharedInputs.map((file) => readFile(file))),
    workspacePackages(packageRoot(dir)).then((found) =>
      Promise.all([...found].map(packageFingerprint)),
    ),
  ]);

  const hash = createHash('sha256');

  hash.update(JSON.stringify({ node: process.version, env }));
  shared.forEach((content) => hash.update(sha(content)));
  files.forEach((file, index) => hash.update(`${file}\0${sha(fixtureContents[index])}`));
  hash.update(packages.sort().join('\n'));

  return hash.digest('hex');
};

const isUpToDate = async ({ dir }, inputs) => {
  const stamp = await readJSON(path.join(buildDir(dir), 'stamp.json')).catch(() => null);

  return stamp?.inputs === inputs && existsSync(path.join(dir, '.next', 'BUILD_ID'));
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const lockFile = (dir) =>
  path.join(os.tmpdir(), 'frogbot-browser-build', `${sha(dir).slice(0, 16)}.lock`);

const acquireLock = async (dir) => {
  const file = lockFile(dir);

  await mkdir(path.dirname(file), { recursive: true });

  for (;;) {
    try {
      await writeFile(file, String(process.pid), { flag: 'wx' });
      locks.add(file);

      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const owner = Number(await readFile(file, 'utf8').catch(() => ''));

    if (owner && isAlive(owner)) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } else {
      await rm(file, { force: true });
    }
  }
};

const releaseLock = async (dir) => {
  const file = lockFile(dir);

  locks.delete(file);
  await rm(file, { force: true });
};

const run = (args, { cwd, env }) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    children.add(child);
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => (output += `${error.stack}\n`));

    child.on('close', (code) => {
      children.delete(child);
      resolve({ code, output });
    });
  });

const build = async (fixture) => {
  const { dir } = fixture;
  const nextBin = createRequire(path.join(dir, 'package.json')).resolve('next/dist/bin/next');
  const schema = path.join(buildDir(dir), 'schema.db');
  const { NODE_ENV: _nodeEnv, ...inherited } = process.env;
  const env = { ...inherited, ...fixture.env, DATABASE_URL: `file:${schema}` };

  const step = async (label, args, stepEnv = env) => {
    const { code, output } = await run(args, { cwd: dir, env: stepEnv });

    if (code !== 0) throw new Error(`${fixture.name}: ${label} failed\n${output}`);
  };

  await step('frogbot generate:importmap', [frogbotBin, 'generate:importmap']);

  await step('next build', [nextBin, 'build', '--no-lint']);
  await mkdir(buildDir(dir), { recursive: true });

  await step('schema push', [frogbotBin, 'run', pushSchemaScript], {
    ...env,
    NODE_ENV: 'development',
  });
};

const ensureBuilt = async (fixture) => {
  const started = Date.now();

  await acquireLock(fixture.dir);

  try {
    if (await isUpToDate(fixture, await fingerprint(fixture))) {
      process.stdout.write(`${fixture.name} up to date\n`);

      return;
    }

    await build(fixture);

    const inputs = await fingerprint(fixture);

    await writeFile(path.join(buildDir(fixture.dir), 'stamp.json'), JSON.stringify({ inputs }));

    process.stdout.write(
      `built ${fixture.name} in ${Math.round((Date.now() - started) / 1000)}s\n`,
    );
  } finally {
    await releaseLock(fixture.dir);
  }
};

const stop = (code) => {
  for (const child of children) child.kill('SIGKILL');

  for (const file of locks) rmSync(file, { force: true });

  process.exit(code);
};

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));

const queue = [...fixtures];

try {
  await Promise.all(
    Array.from({ length: Math.min(concurrentBuilds, queue.length) }, async () => {
      while (queue.length) await ensureBuilt(queue.shift());
    }),
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  stop(1);
}

process.stdout.write('ready\n');

process.stdin.on('end', () => process.exit(0));
process.stdin.resume();

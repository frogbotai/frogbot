#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageRoot = process.cwd();
const cache = path.join(packageRoot, 'node_modules', '.cache', 'frogbot-build');
const buildInfo = path.join(cache, 'tsconfig.tsbuildinfo');
const stampFile = path.join(cache, 'stamp.json');

const { values } = parseArgs({ options: { assets: { type: 'string', default: '' } } });
const assetExtensions = new Set(
  values.assets
    .split(',')
    .filter(Boolean)
    .map((ext) => `.${ext}`),
);

const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));

const readStamp = async (dir) =>
  JSON.parse(
    await readFile(path.join(dir, 'node_modules', '.cache', 'frogbot-build', 'stamp.json'), 'utf8'),
  );

const walk = async (dir) => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
};

const hashFiles = async (dir, files) => {
  const contents = await Promise.all(files.map((file) => readFile(path.join(dir, file))));
  const hash = createHash('sha256');

  files.forEach((file, index) => {
    hash.update(`${file}\0`);
    hash.update(createHash('sha256').update(contents[index]).digest('hex'));
  });

  return hash.digest('hex');
};

const hashTree = async (dir, filter = () => true) =>
  hashFiles(dir, (await walk(dir)).filter(filter));

const workspaceDependencies = () => {
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const names = fields.flatMap((field) =>
    Object.entries(manifest[field] ?? {})
      .filter(([, version]) => version.startsWith('workspace:'))
      .map(([name]) => name),
  );

  return [...new Set(names)].sort();
};

const dependencyApis = async () =>
  Promise.all(
    workspaceDependencies().map(async (name) => {
      const dir = await realpath(path.join(packageRoot, 'node_modules', name));
      const { api } = await readStamp(dir).catch(() => ({ api: 'unbuilt' }));

      return `${name}@${api}`;
    }),
  );

const hashInputs = async ({ configs, rootDir }) => {
  const files = [
    path.join(root, 'scripts', 'build-package.mjs'),
    path.join(root, 'pnpm-lock.yaml'),
    path.join(packageRoot, 'package.json'),
    ...configs.map((config) => path.resolve(packageRoot, config)),
  ];

  const contents = await Promise.all(files.map((file) => readFile(file)));
  const hash = createHash('sha256');

  hash.update(JSON.stringify(process.argv.slice(2)));
  hash.update(JSON.stringify(await dependencyApis()));
  hash.update(await hashTree(path.resolve(packageRoot, rootDir)));
  contents.forEach((content) => hash.update(createHash('sha256').update(content).digest('hex')));

  return hash.digest('hex');
};

const isUpToDate = async () => {
  const stamp = await readStamp(packageRoot).catch(() => null);

  if (!stamp) return false;

  const [inputs, outputs] = await Promise.all([
    hashInputs(stamp),
    hashFiles(path.resolve(packageRoot, stamp.outDir), stamp.files).catch(() => null),
  ]);

  return inputs === stamp.inputs && outputs === stamp.outputs;
};

const writeIfChanged = async (file, content) => {
  const current = await readFile(file).catch(() => null);

  if (current?.equals(Buffer.from(content))) return;

  await writeFile(file, content);
};

const build = async () => {
  const packageRequire = createRequire(path.join(packageRoot, 'package.json'));
  const ts = packageRequire('typescript');
  const tsc = packageRequire.resolve('typescript/bin/tsc');
  const { transformFile } = await import('@swc/core');

  const configFile = ts.readJsonConfigFile(
    path.join(packageRoot, 'tsconfig.json'),
    ts.sys.readFile,
  );

  const { fileNames, options, errors } = ts.parseJsonSourceFileConfigFileContent(
    configFile,
    ts.sys,
    packageRoot,
  );

  if (errors.length > 0) {
    const host = {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => packageRoot,
      getNewLine: () => '\n',
    };

    console.error(ts.formatDiagnostics(errors, host));

    return 1;
  }

  const { declaration, declarationMap, outDir, rootDir, sourceMap } = options;

  const configs = ['tsconfig.json', ...(configFile.extendedSourceFiles ?? [])].map((config) =>
    path.relative(packageRoot, config),
  );

  const stamp = {
    configs,
    rootDir: path.relative(packageRoot, rootDir),
    outDir: path.relative(packageRoot, outDir),
  };

  const inputs = await hashInputs(stamp);

  const sources = fileNames
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
    .map((file) => path.relative(rootDir, file));

  const assets = (await walk(rootDir)).filter((file) => assetExtensions.has(path.extname(file)));

  const declarations = sources.flatMap((source) => {
    const base = source.replace(/\.tsx?$/, '');

    if (!declaration) return [];

    return declarationMap ? [`${base}.d.ts`, `${base}.d.ts.map`] : [`${base}.d.ts`];
  });

  const scripts = sources.flatMap((source) => {
    const base = source.replace(/\.tsx?$/, '');

    return sourceMap ? [`${base}.js`, `${base}.js.map`] : [`${base}.js`];
  });

  const expected = new Set([...scripts, ...declarations, ...assets]);
  const present = new Set();

  const prune = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    let kept = 0;

    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(outDir, file);
      const keep = entry.isDirectory() ? await prune(file) : expected.has(relative);

      if (keep) {
        kept += 1;

        if (!entry.isDirectory()) present.add(relative);
      } else {
        await rm(file, { recursive: true, force: true });
      }
    }

    return kept > 0;
  };

  await rm(stampFile, { force: true });
  await prune(outDir);

  if (declarations.some((file) => !present.has(file))) await rm(buildInfo, { force: true });

  const outputDirs = new Set([...sources, ...assets].map((file) => path.dirname(file)));

  await Promise.all(
    [...outputDirs].map((dir) => mkdir(path.join(outDir, dir), { recursive: true })),
  );

  const target = ts.ScriptTarget[options.target].toLowerCase();
  const useDefineForClassFields =
    options.useDefineForClassFields ?? options.target >= ts.ScriptTarget.ES2022;

  const compile = async (source) => {
    const input = path.join(rootDir, source);
    const output = path.join(outDir, source.replace(/\.tsx?$/, '.js'));

    const { code, map } = await transformFile(input, {
      swcrc: false,
      configFile: false,
      isModule: true,
      sourceMaps: Boolean(sourceMap),
      inlineSourcesContent: false,
      module: { type: 'es6' },
      jsc: {
        target,
        parser: { syntax: 'typescript', tsx: source.endsWith('.tsx') },
        transform: { react: { runtime: 'automatic' }, useDefineForClassFields },
        experimental: { keepImportAttributes: true },
      },
    });

    if (!map) return writeIfChanged(output, code);

    const name = path.basename(output);
    const mapped = {
      ...JSON.parse(map),
      file: name,
      sources: [path.relative(path.dirname(output), input)],
    };

    await Promise.all([
      writeIfChanged(output, `${code}\n//# sourceMappingURL=${name}.map`),
      writeIfChanged(`${output}.map`, JSON.stringify(mapped)),
    ]);
  };

  const copy = async (asset) =>
    writeIfChanged(path.join(outDir, asset), await readFile(path.join(rootDir, asset)));

  const typecheck = () =>
    new Promise((resolve) => {
      const emit = declaration ? '--emitDeclarationOnly' : '--noEmit';
      const args = [
        tsc,
        '-p',
        'tsconfig.json',
        emit,
        '--incremental',
        '--tsBuildInfoFile',
        buildInfo,
      ];

      const child = spawn(process.execPath, args, { cwd: packageRoot, stdio: 'inherit' });

      child.on('error', (error) => {
        console.error(error);
        resolve(1);
      });

      child.on('close', (code) => resolve(code ?? 1));
    });

  const [code] = await Promise.all([
    typecheck(),
    Promise.all(sources.map(compile)),
    Promise.all(assets.map(copy)),
  ]);

  if (code !== 0) return code;

  const api = createHash('sha256')
    .update(await hashTree(outDir, (file) => file.endsWith('.d.ts')))
    .update(JSON.stringify(manifest))
    .update(JSON.stringify(await dependencyApis()))
    .digest('hex');

  const files = [...expected].sort();
  const outputs = await hashFiles(outDir, files);

  await mkdir(cache, { recursive: true });
  await writeFile(stampFile, JSON.stringify({ ...stamp, inputs, outputs, api, files }));

  return 0;
};

const code = (await isUpToDate()) ? 0 : await build();

const bins = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});

await Promise.all(bins.map((file) => chmod(path.join(packageRoot, file), 0o755)));

process.exitCode = code;

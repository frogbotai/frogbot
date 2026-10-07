import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

type PackageJson = {
  dependencies?: Record<string, string>;
  name?: string;
  version?: string;
};

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function readPackage(path: string): Promise<PackageJson> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageJson;
}

async function findPackageRoot(path: string, name: string): Promise<string> {
  let directory = dirname(path);

  while (true) {
    const packagePath = join(directory, 'package.json');

    if (await exists(packagePath)) {
      const pkg = await readPackage(packagePath);

      if (pkg.name === name) return directory;
    }

    const parent = dirname(directory);

    if (parent === directory) break;

    directory = parent;
  }

  throw new Error(`[frogbot] Could not locate source for ${name}`);
}

function words(slug: string): string[] {
  return slug.split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`);
}

export async function piecesPort(args: string[], root = process.cwd()): Promise<void> {
  if (args.length !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args[0])) {
    throw new Error('[frogbot] usage: frogbot pieces:port <slug>');
  }

  const slug = args[0];
  const piece = resolve(root, 'packages', 'pieces', `piece-${slug}`);
  const legacy = `${piece}.legacy`;
  const test = resolve(root, 'test', 'unit', `piece-${slug}`);
  const legacyTest = `${test}.legacy`;
  const packagePath = join(piece, 'package.json');
  const prompt = resolve(root, 'packages', 'pieces', 'PORTING.md');

  if (!(await exists(packagePath))) throw new Error(`[frogbot] Piece package not found: ${piece}`);
  if (await exists(legacy)) throw new Error(`[frogbot] Legacy package already exists: ${legacy}`);

  const hasTest = await exists(test);

  if (hasTest && (await exists(legacyTest))) {
    throw new Error(`[frogbot] Legacy test directory already exists: ${legacyTest}`);
  }

  if (!(await exists(prompt))) throw new Error(`[frogbot] Porting prompt not found: ${prompt}`);

  const oldPackage = await readPackage(packagePath);
  const dependency = `@activepieces/piece-${slug}`;
  if (!oldPackage.dependencies?.[dependency]) {
    throw new Error(`[frogbot] Existing package does not depend on ${dependency}`);
  }

  let entry: string;

  try {
    entry = createRequire(packagePath).resolve(dependency);
  } catch {
    throw new Error(`[frogbot] Upstream source is not installed: ${dependency}`);
  }

  const source = await findPackageRoot(entry, dependency);
  const rootPackage = await readPackage(resolve(root, 'package.json'));
  const version = rootPackage.version ?? '0.0.0';
  const label = words(slug).join(' ');
  const create = `create${words(slug).join('')}`;

  const packageJson = {
    name: `@frogbotai/piece-${slug}`,
    version,
    description: `${slug} tools for FrogBot.`,
    license: 'MIT',
    author: 'Colby Gilbert',
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': { import: './dist/index.js', types: './dist/index.d.ts', default: './dist/index.js' },
    },
    files: ['dist'],
    sideEffects: false,
    scripts: {
      build: 'node ../../../scripts/build-package.mjs',
      clean: 'rm -rf dist',
      typecheck: 'tsc --noEmit',
    },
    dependencies: { zod: '^4.3.6' },
    peerDependencies: { frogbot: 'workspace:*' },
    devDependencies: { frogbot: 'workspace:*', typescript: '5.6.2' },
    publishConfig: {
      access: 'public',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': { import: './dist/index.js', types: './dist/index.d.ts', default: './dist/index.js' },
      },
    },
  };

  const tsconfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      noEmit: false,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', 'src/**/*.spec.ts'],
  };

  await rename(piece, legacy);

  let testMoved = false;

  try {
    if (hasTest) {
      await rename(test, legacyTest);

      testMoved = true;
    }

    await mkdir(join(piece, 'src'), { recursive: true });
    await mkdir(test, { recursive: true });

    await writeFile(join(piece, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
    await writeFile(join(piece, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);

    await writeFile(
      join(piece, 'src', 'define.ts'),
      `import { createPieceHelpers } from 'frogbot/pieces';\n\nexport const { defineAction } = createPieceHelpers();\n`,
    );

    await writeFile(
      join(piece, 'src', 'index.ts'),
      `import { definePiece } from 'frogbot/pieces';\nimport { z } from 'zod';\n\nimport { defineAction } from './define.js';\n\nconst example = defineAction({\n  slug: 'example',\n  description: 'Replace with the first ported action.',\n  input: z.object({}),\n  output: z.object({}),\n  async run() {\n    return {};\n  },\n});\n\nexport const ${create} = definePiece({\n  slug: '${slug}',\n  label: '${label}',\n  actions: [example],\n});\n`,
    );

    await writeFile(
      join(piece, 'README.md'),
      `# \`@frogbotai/piece-${slug}\`\n\nPort ${slug} capabilities from the preserved upstream implementation.\n\n## Usage\n\n\`\`\`ts\nimport { ${create} } from '@frogbotai/piece-${slug}';\n\nexport const ${slug.replaceAll('-', '')} = ${create}();\n\`\`\`\n\n## Actions\n\n| Upstream action slug | Previous wrapper export | Native action | Notes |\n| --- | --- | --- | --- |\n\n## Triggers\n\n| Upstream trigger slug | Native trigger | Type | Notes |\n| --- | --- | --- | --- |\n`,
    );

    await writeFile(
      join(test, 'index.spec.ts'),
      `import { describe, it } from 'vitest';\n\ndescribe('${slug}', () => {\n  it.todo('ports the upstream behavior');\n});\n`,
    );
  } catch (error) {
    await rm(piece, { recursive: true, force: true });

    if (!hasTest || testMoved) await rm(test, { recursive: true, force: true });

    await rename(legacy, piece);

    if (testMoved) await rename(legacyTest, test);

    throw error;
  }

  console.log(`[frogbot] Source: ${source}`);
  console.log(`[frogbot] Prompt: ${prompt}`);
  console.log(`[frogbot] Test: pnpm vitest run --project unit test/unit/piece-${slug}`);
  console.log(`[frogbot] Prepared piece-${slug}; not verified.`);
  console.log(`[frogbot] Legacy: ${relative(root, legacy)}`);

  if (hasTest) console.log(`[frogbot] Legacy test: ${relative(root, legacyTest)}`);
}

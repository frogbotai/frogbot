import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ALLOWLIST,
  checkDocsReferences,
  docsCommands,
  moduleExports,
} from '../../../scripts/check-docs-references.mjs';

const packages = [
  { name: 'frogbot', exports: { '.': './index.js' }, bin: { frogbot: './bin.js' } },
  { name: '@frogbotai/next', exports: { '.': './index.js', './rsc': './rsc.js' } },
  { name: '@frogbotai/ui', exports: { '.': './index.js', './icons/*': './icons/*.js' } },
  {
    name: '@frogbotai/graphql',
    exports: { '.': './index.js', './types': './types.js', './utilities': './utilities.js' },
    bin: { 'frogbot-graphql': './bin.js' },
  },
  { name: 'create-frogbot-app', bin: { 'create-frogbot-app': './bin.js' } },
  { name: '@frogbotai/gateway', bin: { 'frogbotai-gateway': './bin.js' } },
];
const commands = ['dev', 'migrate', 'generate:types'];

const moduleNames: Record<string, string[]> = {
  frogbot: ['FrogBotConfig', 'buildConfig'],
  '@frogbotai/next': ['withFrogBot'],
};

function exportsOf(specifiers: string[]) {
  return new Map(
    specifiers.flatMap((specifier) =>
      moduleNames[specifier] ? [[specifier, new Set(moduleNames[specifier])]] : [],
    ),
  );
}

function check(content: string, reportStale = false) {
  return checkDocsReferences({
    files: [{ file: 'fixture.mdx', content }],
    packages,
    commands,
    exportsOf,
    allowlist: ALLOWLIST,
    reportStale,
  });
}

function fence(content: string, language = 'bash', marker = '```') {
  return `${marker}${language}\n${content}\n${marker}\n`;
}

describe('checkDocsReferences', () => {
  it('reports an unregistered FrogBot command', () => {
    const problems = check(fence('npx frogbot generate:db-schema'));

    expect(problems).toEqual([
      {
        file: 'fixture.mdx',
        line: 2,
        kind: 'command',
        name: 'frogbot generate:db-schema',
        reason: 'command is not registered',
      },
    ]);
  });

  it('reports an unexported core subpath', () => {
    const problems = check(fence("import { a } from 'frogbot/shared'", 'ts'));

    expect(problems).toEqual([
      {
        file: 'fixture.mdx',
        line: 2,
        kind: 'import',
        name: 'frogbot/shared',
        reason: 'subpath is not exported',
      },
    ]);
  });

  it('reports multiline imports at the specifier line', () => {
    const problems = check(fence("import {\n a,\n} from '@frogbotai/next/auth'", 'ts'));

    expect(problems).toEqual([
      {
        file: 'fixture.mdx',
        line: 4,
        kind: 'import',
        name: '@frogbotai/next/auth',
        reason: 'subpath is not exported',
      },
    ]);
  });

  it('reports unknown workspace bins', () => {
    const problems = check(fence('pnpm frogbot-nope x'));

    expect(problems).toEqual([
      {
        file: 'fixture.mdx',
        line: 2,
        kind: 'bin',
        name: 'frogbot-nope',
        reason: 'bin is not published',
      },
    ]);
  });

  it.each(['pnpm add', 'npm install', 'npm i', 'yarn add'])(
    'reports unknown packages after %s',
    (runner) => {
      const problems = check(fence(`${runner} -D @frogbotai/nope@latest --save-dev -E`));

      expect(problems).toEqual([
        {
          file: 'fixture.mdx',
          line: 2,
          kind: 'package',
          name: '@frogbotai/nope',
          reason: 'package is not publishable',
        },
      ]);
    },
  );

  it.each([
    'pnpm add @frogbotai/ui frogbot react',
    'pnpm add @frogbotai/graphql -D --save-dev -E',
    'npm install frogbot@latest @frogbotai/ui@1.0.0 -D',
    'npm run frogbot migrate',
    'cross-env FROGBOT_CONFIG_PATH=x frogbot migrate',
    'FROGBOT_CONFIG_PATH=x pnpm exec frogbot migrate',
    'npx frogbot migrate',
    'yarn frogbot migrate',
    'bunx frogbot migrate',
    'npm exec frogbot migrate',
    'pnpm frogbot-graphql generate:schema',
    'npx create-frogbot-app app',
    'pnpm frogbotai-gateway',
    'echo "frogbot nope"',
  ])('accepts valid shell code: %s', (content) => {
    const problems = check(fence(content));

    expect(problems).toEqual([]);
  });

  it.each([
    "import frogbot from 'frogbot'",
    "import config from '@frogbot-config'",
    "import { Check } from '@frogbotai/ui/icons/check'",
    "import type { A } from '@frogbotai/graphql/types'",
    "import '@frogbotai/graphql/utilities'",
    "import 'create-frogbot-app'",
  ])('accepts valid imports: %s', (content) => {
    const problems = check(fence(content, 'ts'));

    expect(problems).toEqual([]);
  });

  it.each(['ts', 'tsx', 'typescript', 'js', 'jsx', 'mjs'])(
    'checks imports in %s fences',
    (language) => {
      const problems = check(fence("import 'frogbot/shared'", language));

      expect(problems).toHaveLength(1);
      expect(problems[0].name).toBe('frogbot/shared');
    },
  );

  it.each(['bash', 'sh', 'shell', 'zsh', 'console'])('checks commands in %s fences', (language) => {
    const problems = check(fence('$ pnpm frogbot nope', language));

    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(2);
  });

  it.each(['&&', '||', ';', '|'])('checks command position after %s', (separator) => {
    const problems = check(fence(`echo done ${separator} pnpm frogbot nope`));

    expect(problems).toHaveLength(1);
    expect(problems[0].name).toBe('frogbot nope');
  });

  it('checks a prompted command after a shell separator', () => {
    const problems = check(fence('echo done && $ pnpm frogbot nope'));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ line: 2, name: 'frogbot nope' });
  });

  it.each(['~~~', '````'])(
    'checks %s fences without treating shorter markers as closers',
    (marker) => {
      const problems = check(fence('```\nnpx frogbot generate:db-schema', 'bash', marker));

      expect(problems).toHaveLength(1);
      expect(problems[0].line).toBe(3);
    },
  );

  it.each(['~~~', '````'])('accepts valid %s fences', (marker) => {
    const problems = check(fence('pnpm frogbot migrate', 'bash', marker));

    expect(problems).toEqual([]);
  });

  it('rejects the unregistered core GraphQL command without an exception', () => {
    const problems = check(fence('frogbot generate:graphql-schema'));

    expect(problems[0]).toMatchObject({
      kind: 'command',
      name: 'frogbot generate:graphql-schema',
    });
  });

  it('ignores commands in prose and non-shell fences', () => {
    const problems = check(
      `Use frogbot dev or frogbot nope.\n${fence('frogbot dev\nfrogbot nope', 'text')}${fence('frogbot nope', 'json')}`,
    );

    expect(problems).toEqual([]);
  });

  it('checks side-effect imports, dynamic imports and requires', () => {
    const problems = check(
      fence(
        "import 'frogbot/shared'\nawait import(\n 'frogbot/shared'\n)\nrequire('frogbot/shared')",
        'js',
      ),
    );

    expect(problems.map(({ line }) => line)).toEqual([2, 4, 6]);
  });

  it('rejects parent segments even under an exports pattern', () => {
    const problems = check(fence("import '@frogbotai/ui/icons/../x'", 'ts'));

    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toBe('subpath is not exported');
  });

  it('rejects subpaths on packages without exports', () => {
    const problems = check(fence("import '@frogbotai/gateway/missing'", 'ts'));

    expect(problems).toHaveLength(1);
  });

  it('reports nonexistent packages in imports', () => {
    const problems = check(fence("import '@frogbotai/nope'", 'ts'));

    expect(problems[0]).toMatchObject({ kind: 'import', reason: 'package is not publishable' });
  });

  it('checks inline installation code', () => {
    const problems = check('Install with `pnpm add @frogbotai/nope -D`.');

    expect(problems[0]).toMatchObject({ line: 1, kind: 'package', name: '@frogbotai/nope' });
  });

  it('accepts the allowlisted placeholder without reporting it as stale', () => {
    const problems = check(fence("import '@frogbotai/your-db-adapter'", 'ts'), true);

    expect(problems).toEqual([]);
  });

  it('ignores unused allowlist entries in partial scans', () => {
    const problems = check('No references.');

    expect(problems).toEqual([]);
  });

  it('reports unused allowlist entries in full scans', () => {
    const problems = check('No references.', true);

    expect(problems).toEqual([
      {
        file: 'scripts/check-docs-references.mjs',
        line: 1,
        kind: 'allowlist',
        name: '@frogbotai/your-db-adapter',
        reason: 'stale entry: placeholder in migrations.mdx',
      },
    ]);
  });

  it('reads identifier and string keys from the commands object literal', () => {
    const result = docsCommands(
      "const commands: Record<string, unknown> = { dev: handler, 'generate:types': handler, run: handler }",
    );

    expect(result).toEqual(['dev', 'generate:types', 'run']);
  });

  it.each(['const other = { dev: handler }', 'const commands = other', 'const commands = {}'])(
    'rejects missing or empty command literals: %s',
    (source) => {
      expect(() => docsCommands(source)).toThrow('commands object literal is missing or empty');
    },
  );

  it('rejects the unexported Config import from ee6813d9 docs/plugins/build-your-own.mdx', () => {
    const problems = check(
      fence(
        "import type { Config } from 'frogbot'\n\nexport const samplePlugin =\n  (pluginOptions: PluginTypes) =>\n  (incomingConfig: Config): Config => incomingConfig",
        'ts',
      ),
    );

    expect(problems).toEqual([
      {
        file: 'fixture.mdx',
        line: 2,
        kind: 'export',
        name: 'Config from frogbot',
        reason: 'name is not exported',
      },
    ]);
  });

  it.each([
    "import type { FrogBotConfig } from 'frogbot'",
    "import { buildConfig as build, type FrogBotConfig } from 'frogbot'",
    "export { withFrogBot } from '@frogbotai/next'",
    "import { anything } from '@frogbotai/ui'",
    "import { anything } from 'other-package'",
  ])('accepts named imports that exist or are not resolved: %s', (content) => {
    const problems = check(fence(content, 'ts'));

    expect(problems).toEqual([]);
  });

  it('reports each missing name at its own line', () => {
    const problems = check(
      fence(
        "import {\n  buildConfig,\n  Config,\n} from 'frogbot'\nexport { nope as yes } from '@frogbotai/next'",
        'tsx',
      ),
    );

    expect(problems.map(({ line, name }) => ({ line, name }))).toEqual([
      { line: 4, name: 'Config from frogbot' },
      { line: 6, name: 'nope from @frogbotai/next' },
    ]);
  });

  it('skips named imports from unexported subpaths', () => {
    const problems = check(fence("import { a } from 'frogbot/shared'", 'ts'));

    expect(problems.map(({ kind }) => kind)).toEqual(['import']);
  });
});

describe('moduleExports', () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { force: true, recursive: true });

    directory = undefined;
  });

  function workspace(files: Record<string, string>) {
    directory = mkdtempSync(path.join(os.tmpdir(), 'check-docs-references-'));

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), content);
    }

    return directory;
  }

  it('reads export names from built declaration files, following re-exports', () => {
    const dir = workspace({
      'dist/index.d.ts':
        "export type { FrogBotConfig } from './config.js';\nexport declare const buildConfig: () => void;\n",
      'dist/config.d.ts': 'export type FrogBotConfig = { secret: string };\n',
      'dist/shared.d.ts': 'export declare const shared: 1;\n',
    });

    const exportsOf = moduleExports([
      {
        name: 'frogbot',
        dir,
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
          './shared': './dist/shared.js',
        },
      },
    ]);

    const modules = exportsOf(['frogbot', 'frogbot/shared', 'frogbot/missing']);

    expect([...modules.keys()]).toEqual(['frogbot', 'frogbot/shared']);
    expect([...modules.get('frogbot')!].sort()).toEqual(['FrogBotConfig', 'buildConfig']);
    expect([...modules.get('frogbot/shared')!]).toEqual(['shared']);
  });

  it('fails when the built types are missing', () => {
    const dir = workspace({});
    const exportsOf = moduleExports([
      { name: 'frogbot', dir, exports: { '.': { types: './dist/index.d.ts' } } },
    ]);

    expect(() => exportsOf(['frogbot'])).toThrow('missing built types, run pnpm build');
  });
});

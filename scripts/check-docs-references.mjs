import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { publishablePackages, readJSON, ROOT } from './lib/workspace.mjs';

export const ALLOWLIST = [
  { name: '@frogbotai/your-db-adapter', reason: 'placeholder in migrations.mdx' },
];

const IMPORT_LANGUAGES = new Set(['ts', 'tsx', 'typescript', 'js', 'jsx', 'mjs']);
const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next']);

function walk(dir) {
  if (!existsSync(dir)) return [];

  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) files.push(...walk(file));
    else if (entry.isFile()) files.push(file);
  }

  return files;
}

export function docsFiles({ directory, root = ROOT } = {}) {
  const paths = directory
    ? walk(path.resolve(directory)).filter((file) => /\.mdx?$/.test(file))
    : [
        ...walk(path.join(root, 'docs')).filter((file) => file.endsWith('.mdx')),
        path.join(root, 'README.md'),
        ...walk(path.join(root, 'packages')).filter((file) => path.basename(file) === 'README.md'),
        ...walk(path.join(root, 'templates')).filter((file) =>
          /^[^/]+\/README\.md$/.test(path.relative(path.join(root, 'templates'), file)),
        ),
        ...walk(path.join(root, 'skills')).filter((file) => file.endsWith('.md')),
      ];

  return paths.sort().map((file) => ({ file, content: readFileSync(file, 'utf8') }));
}

export function docsPackages() {
  return publishablePackages().map(({ dir }) => {
    const pkg = readJSON(path.join(dir, 'package.json'));

    return { ...pkg, ...pkg.publishConfig };
  });
}

export function docsCommands(
  source = readFileSync(path.join(ROOT, 'packages/frogbot/src/bin/index.ts'), 'utf8'),
) {
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  let commands = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'commands' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      commands = node.initializer.properties.flatMap((property) => {
        const name = property.name;

        return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? [name.text] : [];
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(ast);

  if (commands.length === 0) {
    throw new Error('[check-docs-references] commands object literal is missing or empty.');
  }

  return commands;
}

export function docsFences(content) {
  const fences = [];
  const outside = [];
  let open;

  content.split('\n').forEach((line, index) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

    if (open) {
      if (
        match &&
        match[1][0] === open.char &&
        match[1].length >= open.length &&
        !match[2].trim()
      ) {
        fences.push(open);
        open = undefined;
      } else {
        open.content += `${line}\n`;
      }

      return;
    }

    if (match) {
      open = {
        char: match[1][0],
        length: match[1].length,
        language: match[2].trim().split(/\s+/, 1)[0],
        line: index + 2,
        content: '',
      };
    } else {
      outside.push({ line: index + 1, content: line });
    }
  });

  if (open) fences.push(open);

  return { fences, outside };
}

function packageName(name) {
  return name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
}

function isFrogBotPackage(name) {
  return name === 'frogbot' || name.startsWith('frogbot/') || name.startsWith('@frogbotai/');
}

function exported(pkg, name) {
  const subpath = name === pkg.name ? '.' : `.${name.slice(pkg.name.length)}`;

  if (subpath.split('/').includes('..')) return false;

  if (!pkg.exports) return subpath === '.';

  const keys =
    typeof pkg.exports === 'object' && !Array.isArray(pkg.exports) ? Object.keys(pkg.exports) : [];

  const exports = keys.some((key) => key.startsWith('.')) ? pkg.exports : { '.': pkg.exports };

  return Object.entries(exports).some(([key, target]) => {
    if (target === null) return false;

    const star = key.indexOf('*');

    if (star === -1) return key === subpath;

    return subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1));
  });
}

function shellSegments(line) {
  const tokens =
    line.replace(/^\s*\$\s+/, '').match(/&&|\|\||[;|]|(?:[^\s'";|&]+|'[^']*'|"[^"]*")+/g) ?? [];

  const segments = [[]];

  for (const token of tokens) {
    if (['&&', '||', ';', '|'].includes(token)) segments.push([]);
    else if (token.startsWith('#')) break;
    else segments.at(-1).push(token.replace(/^(['"])(.*)\1$/, '$2'));
  }

  return segments;
}

function installArguments(tokens) {
  if (
    (tokens[0] === 'pnpm' && tokens[1] === 'add') ||
    (tokens[0] === 'yarn' && tokens[1] === 'add') ||
    (tokens[0] === 'npm' && ['install', 'i'].includes(tokens[1]))
  ) {
    return tokens.slice(2);
  }

  return undefined;
}

export function checkDocsReferences({
  files,
  packages,
  commands,
  allowlist = ALLOWLIST,
  reportStale = false,
}) {
  const manifests = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const bins = new Set(
    packages.flatMap((pkg) =>
      typeof pkg.bin === 'string' ? [pkg.name.split('/').at(-1)] : Object.keys(pkg.bin ?? {}),
    ),
  );

  const knownCommands = new Set(commands);
  const used = new Set();
  const problems = [];

  function report({ file, line, kind, name, reason }) {
    const entry = allowlist.find((item) => item.name === name);

    if (entry) used.add(entry.name);
    else if (reason) problems.push({ file, line, kind, name, reason });
  }

  function checkPackage({ file, line, kind, name }) {
    if (!isFrogBotPackage(name)) return;

    const pkg = manifests.get(packageName(name));
    const reason = !pkg
      ? 'package is not publishable'
      : kind === 'import' && !exported(pkg, name)
        ? 'subpath is not exported'
        : undefined;

    report({ file, line, kind, name, reason });
  }

  function checkShell({ file, line, content, installsOnly = false }) {
    for (const segment of shellSegments(content)) {
      if (segment[0] === '$') segment.shift();

      const tokens = segment.filter(
        (token) => token !== 'cross-env' && !/^[A-Za-z_]\w*=/.test(token),
      );

      const installs = installArguments(tokens);

      if (installs) {
        for (const token of installs) {
          if (token.startsWith('-')) continue;

          const name = token.replace(/@[^@/]*$/, '');

          checkPackage({ file, line, kind: 'package', name });
        }

        continue;
      }

      if (installsOnly) continue;

      if (['npx', 'pnpm', 'yarn', 'bunx'].includes(tokens[0])) tokens.shift();
      else if (tokens[0] === 'npm' && ['run', 'exec'].includes(tokens[1])) tokens.splice(0, 2);

      if (tokens[0] === 'exec') tokens.shift();

      const [bin, command] = tokens;

      if (bin === 'frogbot') {
        report({
          file,
          line,
          kind: 'command',
          name: `frogbot ${command ?? ''}`.trim(),
          reason: knownCommands.has(command) ? undefined : 'command is not registered',
        });
      } else if (bin === 'create-frogbot-app' || /^frogbot(?:ai)?-/.test(bin ?? '')) {
        report({
          file,
          line,
          kind: 'bin',
          name: bin,
          reason: bins.has(bin) ? undefined : 'bin is not published',
        });
      }
    }
  }

  for (const { file, content } of files) {
    const { fences, outside } = docsFences(content);

    for (const fence of fences) {
      if (IMPORT_LANGUAGES.has(fence.language)) {
        const pattern = /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)(['"])([^'"\n]+)\1/g;

        for (const match of fence.content.matchAll(pattern)) {
          const offset = match.index + match[0].indexOf(match[1]) + 1;
          const line = fence.line + fence.content.slice(0, offset).split('\n').length - 1;

          checkPackage({ file, line, kind: 'import', name: match[2] });
        }
      }

      if (SHELL_LANGUAGES.has(fence.language)) {
        fence.content
          .split('\n')
          .forEach((line, index) => checkShell({ file, line: fence.line + index, content: line }));
      }
    }

    for (const line of outside) {
      for (const match of line.content.matchAll(/(`+)([^`]+)\1/g)) {
        checkShell({ file, line: line.line, content: match[2], installsOnly: true });
      }
    }
  }

  if (reportStale) {
    for (const entry of allowlist) {
      if (!used.has(entry.name)) {
        problems.push({
          file: 'scripts/check-docs-references.mjs',
          line: 1,
          kind: 'allowlist',
          name: entry.name,
          reason: `stale entry: ${entry.reason}`,
        });
      }
    }
  }

  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function main() {
  const directory = process.argv[2];
  const files = docsFiles({ directory });
  const problems = checkDocsReferences({
    files,
    packages: docsPackages(),
    commands: docsCommands(),
    reportStale: !directory,
  });

  if (problems.length > 0) {
    for (const { file, line, kind, name, reason } of problems) {
      const location = path.isAbsolute(file) ? path.relative(ROOT, file) : file;

      console.error(`${location}:${line}  ${kind} ${name} (${reason})`);
    }

    console.error(`[check-docs-references] FAIL - ${problems.length} issue(s) found.`);
    process.exit(1);
  }

  const fences = files.reduce((total, file) => total + docsFences(file.content).fences.length, 0);

  console.log(`[check-docs-references] OK - ${files.length} files, ${fences} fences scanned.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

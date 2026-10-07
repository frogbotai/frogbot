#!/usr/bin/env node
// Option-table registry: every `| Option |` table in docs/ is listed in docs/option-tables.json as
// `{ page, heading, type }`, where `type` is a TypeScript type expression evaluated against the
// built packages (`import('frogbot').FrogBotConfig['jobs']`). A table's first column must equal
// the type's properties; a nested row such as `options.token` is checked against the type of
// `options`, and `[key]` against an index signature. Properties starting with `_` or typed `never`
// may be left out. Tables under one heading match that heading's entries in document order.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { docsFences, docsFiles, docsPackages, typesPaths } from './check-docs-references.mjs';
import { ROOT } from './lib/workspace.mjs';

export const REGISTRY = path.join(ROOT, 'docs', 'option-tables.json');

const OPTION_HEADER = /^\|\s*Option\s*\|/;

const INDEX_ROW = /^\[[^\]]+\]$/;

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
}

function rowNames(cell) {
  const spans = [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());

  return spans.length > 0 ? spans : [cell.replaceAll('*', '').trim()];
}

function title(content) {
  return content.match(/^---\n[\s\S]*?^title:\s*(.+?)\s*$/m)?.[1].replace(/^(['"])(.*)\1$/, '$2');
}

export function optionTables({ page, content }) {
  const { outside } = docsFences(content);
  const tables = [];
  let heading = title(content) ?? '';

  for (let index = 0; index < outside.length; index++) {
    const { line, content: text } = outside[index];
    const match = text.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);

    if (match) heading = match[1];

    if (!OPTION_HEADER.test(text)) continue;

    const rows = [];
    let next = index + 2;

    while (
      next < outside.length &&
      outside[next].line === outside[next - 1].line + 1 &&
      outside[next].content.trimStart().startsWith('|')
    ) {
      rows.push({ line: outside[next].line, names: rowNames(cells(outside[next].content)[0]) });
      next++;
    }

    tables.push({ page, heading, line, rows });
    index = next - 1;
  }

  return tables;
}

function isOptional(checker, name, symbols) {
  if (name.startsWith('_')) return true;

  return symbols.every(
    (symbol) =>
      checker.getNonNullableType(checker.getTypeOfSymbol(symbol)).flags & ts.TypeFlags.Never,
  );
}

function shape(checker, types) {
  const properties = new Map();
  const indexes = [];

  function visit(type) {
    if (type.isUnion()) return type.types.forEach(visit);

    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      return checker.getTypeArguments(type).forEach(visit);
    }

    if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) return;

    for (const symbol of checker.getPropertiesOfType(type)) {
      properties.set(symbol.name, [...(properties.get(symbol.name) ?? []), symbol]);
    }

    indexes.push(...checker.getIndexInfosOfType(type).map(({ type: value }) => value));
  }

  types.forEach((type) => visit(checker.getNonNullableType(type)));

  return { properties, indexes };
}

function compare(checker, { types, rows, prefix, report }) {
  const { properties, indexes } = shape(checker, types);
  const groups = new Map();

  for (const row of rows) {
    const [head, ...rest] = row.path;

    groups.set(head, [...(groups.get(head) ?? []), { ...row, path: rest }]);
  }

  for (const [name, symbols] of properties) {
    if (!groups.has(name) && !isOptional(checker, name, symbols)) {
      report({ message: `missing option ${prefix}${name}` });
    }
  }

  for (const [name, children] of groups) {
    const symbols = properties.get(name);
    const index = INDEX_ROW.test(name) && indexes.length > 0;

    if (!symbols && !index) {
      report({ line: children[0].line, message: `option ${prefix}${name} is not in the type` });

      continue;
    }

    const nested = children.filter(({ path: rest }) => rest.length > 0);

    if (nested.length === 0) continue;

    compare(checker, {
      types: index ? indexes : symbols.map((symbol) => checker.getTypeOfSymbol(symbol)),
      rows: nested,
      prefix: `${prefix}${name}.`,
      report,
    });
  }
}

export function optionTypes(entries, { paths }) {
  const file = path.join(ROOT, '__option-tables__.ts');
  const source = entries.map(({ type }, index) => `export type T${index} = ${type};`).join('\n');
  const options = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    paths,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
  };

  const host = ts.createCompilerHost(options);
  const { fileExists, getSourceFile, readFile } = host;

  host.fileExists = (name) => name === file || fileExists(name);
  host.readFile = (name) => (name === file ? source : readFile(name));

  host.getSourceFile = (name, version, ...rest) =>
    name === file
      ? ts.createSourceFile(name, source, version, true)
      : getSourceFile(name, version, ...rest);

  const program = ts.createProgram([file], options, host);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(file);
  const errors = new Map();

  for (const diagnostic of program.getSemanticDiagnostics(sourceFile)) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);

    errors.set(line, ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
  }

  return entries.map((entry, index) => {
    if (errors.has(index)) return { error: errors.get(index) };

    const alias = sourceFile.statements[index];

    return { checker, type: checker.getTypeAtLocation(alias.name) };
  });
}

export function checkOptionTables({ files, registry, resolve }) {
  const problems = [];
  const tables = files.flatMap(optionTables);
  const queues = new Map();

  for (const table of tables) {
    const key = `${table.page}\n${table.heading}`;

    queues.set(key, [...(queues.get(key) ?? []), table]);
  }

  const matched = registry.map((entry) => {
    const table = queues.get(`${entry.page}\n${entry.heading}`)?.shift();

    if (!table) {
      problems.push({
        file: 'docs/option-tables.json',
        line: 1,
        message: `no "| Option |" table under ${entry.page} "${entry.heading}"`,
      });
    }

    return table;
  });

  for (const table of [...queues.values()].flat()) {
    problems.push({
      file: `docs/${table.page}.mdx`,
      line: table.line,
      message: `option table under "${table.heading}" is not registered in docs/option-tables.json`,
    });
  }

  const present = registry.flatMap((entry, index) =>
    matched[index] ? [{ entry, table: matched[index] }] : [],
  );

  const types = present.length > 0 ? resolve(present.map(({ entry }) => entry)) : [];

  present.forEach(({ table }, index) => {
    const { checker, type, error } = types[index];
    const file = `docs/${table.page}.mdx`;

    if (error) {
      problems.push({ file, line: table.line, message: `type does not resolve: ${error}` });

      return;
    }

    compare(checker, {
      types: [type],
      rows: table.rows.flatMap(({ line, names }) =>
        names.map((name) => ({ line, path: name.split('.') })),
      ),
      prefix: '',
      report: ({ line = table.line, message }) => problems.push({ file, line, message }),
    });
  });

  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function main() {
  const files = docsFiles({ directory: path.join(ROOT, 'docs') })
    .filter(({ file }) => file.endsWith('.mdx'))
    .map(({ file, content }) => ({
      page: path.relative(path.join(ROOT, 'docs'), file).replace(/\.mdx$/, ''),
      content,
    }));

  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const paths = typesPaths(docsPackages());
  const problems = checkOptionTables({
    files,
    registry,
    resolve: (entries) => optionTypes(entries, { paths }),
  });

  if (problems.length > 0) {
    for (const { file, line, message } of problems) console.error(`${file}:${line}  ${message}`);

    console.error(`\n[check-option-tables] FAIL - ${problems.length} issue(s) found.`);
    process.exit(1);
  }

  console.log(`[check-option-tables] OK - ${registry.length} option tables checked.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

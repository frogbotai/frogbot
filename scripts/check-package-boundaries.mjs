#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { uiManifestProblems } from './lib/uiPackage.mjs';
import { ROOT } from './lib/workspace.mjs';

const UI_MANIFEST = 'packages/ui/package.json';

const UI_SOURCE = 'packages/ui/src/';

const UI_ADMIN = 'packages/ui/src/admin/';

const UI_REST = 'packages/ui/src/chat/rest/';

const SOURCE = /\.(?:[cm]?ts|tsx)$/;

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next', 'build']);

const NEXT = /^(?:next|@payloadcms\/next|@frogbotai\/next)(?:\/|$)/;

const OUTSIDE_SHARED = /^(?:@payloadcms\/|payload(?:\/|$)|@frogbotai\/ui\/admin(?:\/|$))/;

const PAYLOAD_UI = /^@payloadcms\/ui(?:\/|$)/;

const FROGBOT = /^frogbot(?:\/|$)/;

export const RULES = {
  'ui-shared':
    'packages/ui outside src/admin imports no @payloadcms/*, payload, next, @frogbotai/next or admin code',
  'ui-frogbot': 'packages/ui imports frogbot only as types, and only in src/chat/rest',
  'ui-admin-next':
    'packages/ui/src/admin imports no next, @payloadcms/next or @frogbotai/next; it uses its adapters',
  'payload-ui': 'only packages/ui/src/admin imports @payloadcms/ui',
  manifest:
    'packages/ui lists @payloadcms/ui, @payloadcms/translations, payload and frogbot only as optional peers and dev dependencies, and never names next',
};

function typeOnlyClause(clause) {
  if (!clause) return false;

  if (clause.isTypeOnly) return true;

  const bindings = clause.namedBindings;

  return (
    !clause.name &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function typeOnlyExport(node) {
  if (node.isTypeOnly) return true;

  const clause = node.exportClause;

  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length > 0 &&
    clause.elements.every((element) => element.isTypeOnly)
  );
}

export function moduleImports(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];

  const add = (literal, typeOnly) => {
    if (!literal || !ts.isStringLiteralLike(literal)) return;

    const { line } = source.getLineAndCharacterOfPosition(literal.getStart(source));

    found.push({ specifier: literal.text, typeOnly, line: line + 1 });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, typeOnlyClause(node.importClause));
    else if (ts.isExportDeclaration(node)) add(node.moduleSpecifier, typeOnlyExport(node));
    else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        add(node.moduleReference.expression, node.isTypeOnly);
      }
    } else if (ts.isImportTypeNode(node)) add(node.argument.literal, true);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node.arguments[0], false);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

function sourceFiles(root, dir) {
  const files = [];
  const walk = (current) => {
    let entries;

    try {
      entries = readdirSync(path.join(root, current), { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relative = path.posix.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(relative);
      } else if (SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(relative);
      }
    }
  };

  walk(dir);

  return files.sort();
}

function intoAdmin(file, specifier) {
  if (!specifier.startsWith('.')) return false;

  const target = path.posix.join(path.posix.dirname(file), specifier);

  return `${target}/`.startsWith(UI_ADMIN);
}

function uiProblems(file, imports) {
  const admin = file.startsWith(UI_ADMIN);
  const problems = [];

  for (const { specifier, typeOnly, line } of imports) {
    const at = { file, line, specifier };

    if (admin) {
      if (NEXT.test(specifier)) problems.push({ ...at, rule: 'ui-admin-next' });

      continue;
    }

    if (OUTSIDE_SHARED.test(specifier) || NEXT.test(specifier) || intoAdmin(file, specifier)) {
      problems.push({ ...at, rule: 'ui-shared' });
    } else if (FROGBOT.test(specifier) && !(typeOnly && file.startsWith(UI_REST))) {
      problems.push({ ...at, rule: 'ui-frogbot' });
    }
  }

  return problems;
}

function payloadUIProblems(file, imports) {
  if (file.startsWith(UI_SOURCE)) return [];

  return imports
    .filter(({ specifier }) => PAYLOAD_UI.test(specifier))
    .map(({ specifier, line }) => ({ file, line, specifier, rule: 'payload-ui' }));
}

export function checkPackageBoundaries({ root = ROOT } = {}) {
  const manifest = JSON.parse(readFileSync(path.join(root, UI_MANIFEST), 'utf8'));
  const problems = uiManifestProblems(manifest).map((field) => ({
    file: UI_MANIFEST,
    field,
    rule: 'manifest',
  }));

  for (const file of sourceFiles(root, 'packages')) {
    const ui = file.startsWith(UI_SOURCE);

    if (!ui && !file.includes('/src/')) continue;

    const text = readFileSync(path.join(root, file), 'utf8');

    if (!ui && !text.includes('@payloadcms/ui')) continue;

    const imports = moduleImports(file, text);

    if (ui) problems.push(...uiProblems(file, imports));

    problems.push(...payloadUIProblems(file, imports));
  }

  return problems;
}

function main() {
  const problems = checkPackageBoundaries();

  if (problems.length === 0) {
    console.log('✔ @frogbotai/ui keeps Payload and admin code in src/admin, and Next out.');

    return;
  }

  console.error('✖ These break the UI package boundaries:\n');

  for (const { file, line, specifier, field, rule } of problems) {
    const where = field ? `${file} → ${field}` : `${file}:${line} imports ${specifier}`;

    console.error(`  ${where}\n    ${RULES[rule]}`);
  }

  console.error(
    `\n${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}. See the layer table in CONTRIBUTING.md.`,
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

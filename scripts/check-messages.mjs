#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { ROOT } from './lib/workspace.mjs';

const UPSTREAM = /payloadcms\.com|\bPayload\b/;

const ALLOWED = ['Payload Too Large'];

const SOURCE = /\.(ts|tsx|mts|js|mjs)$/;

const TEST = /\.(spec|test)\.|\.d\.ts$/;

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '__tests__', '.next']);

const UPSTREAM_DOCS_FILE = 'packages/frogbot/src/errors/upstreamMessages.ts';

function walk(dir, inSrc = false) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : walk(file, inSrc || entry.name === 'src');
    }

    return inSrc && SOURCE.test(entry.name) && !TEST.test(entry.name) ? [file] : [];
  });
}

const STRING_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

/** The string and template literals in a source file whose text names Payload or links its docs. */
export function upstreamStrings(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found = [];

  function visit(node) {
    if (STRING_KINDS.has(node.kind)) {
      const text = ALLOWED.reduce((rest, allowed) => rest.replaceAll(allowed, ''), node.text);

      if (UPSTREAM.test(text)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        found.push({ line: line + 1, text: node.text });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return found;
}

function slug(heading) {
  return heading
    .replace(/`([^`]*)`/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** FrogBot docs pages, `page` or `page#anchor`, that `toFrogBotMessage` links to but the docs lack. */
export function missingDocs({ pages, root = ROOT }) {
  return pages.filter((page) => {
    const [file, anchor] = page.split('#');
    const mdx = path.join(root, 'docs', `${file}.mdx`);

    if (!existsSync(mdx)) return true;
    if (!anchor) return false;

    return !readFileSync(mdx, 'utf8')
      .split('\n')
      .some((line) => /^#{1,6}\s/.test(line) && slug(line.replace(/^#+\s*/, '')) === anchor);
  });
}

function frogbotPages(root) {
  const source = readFileSync(path.join(root, UPSTREAM_DOCS_FILE), 'utf8');
  const table = /UPSTREAM_DOCS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '';

  return [...table.matchAll(/:\s*'([^']+)'/g)].map(([, page]) => page);
}

export function checkMessages({ root = ROOT } = {}) {
  const problems = [];

  for (const file of walk(path.join(root, 'packages'))) {
    for (const { line, text } of upstreamStrings(file, readFileSync(file, 'utf8'))) {
      problems.push(`${path.relative(root, file)}:${line}: ${JSON.stringify(text)}`);
    }
  }

  const pages = frogbotPages(root);

  if (!pages.length) problems.push(`${UPSTREAM_DOCS_FILE}: UPSTREAM_DOCS not found`);

  for (const page of missingDocs({ pages, root })) {
    problems.push(`${UPSTREAM_DOCS_FILE}: docs page "${page}" doesn't exist`);
  }

  return problems;
}

function main() {
  const problems = checkMessages();

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);

    console.error(
      `\n[check-messages] FAIL - ${problems.length} message(s) point at Payload. Name FrogBot and link https://docs.frogbot.ai instead.`,
    );

    process.exit(1);
  }

  console.log('[check-messages] OK - no source string names Payload or links its docs.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

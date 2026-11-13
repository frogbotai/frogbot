#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const DESIGN = 'skills/frogbot/reference/ADMIN-DESIGN.md';

const UI_SRC = 'packages/ui/src';

const UI_INDEX = 'packages/ui/src/index.ts';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

const CODE_SPAN = /`([^`\n]+)`/g;

const TOKEN = /--[a-z][\w-]*/g;

const COMPONENT = /^[A-Z][A-Za-z]+$/;

const JSX_TAG = /(?<![\w.])<([A-Z][A-Za-z]*)(?![\w.])/g;

const UI_IMPORT =
  /import\s*(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]@frogbotai\/ui['"]/g;

const EXPORT_LIST = /export\s*(?:type\s*)?\{([^}]*)\}/g;

const TOKEN_DEFINITION = /(--[a-z][\w-]*)\s*:/g;

function walk(dir, pattern) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) return walk(file, pattern);

    return entry.isFile() && pattern.test(entry.name) ? [file] : [];
  });
}

function names(list) {
  return list
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        .trim(),
    )
    .filter(Boolean);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function namedInDesign(markdown) {
  const tokens = [];
  const components = [];
  const prose = [];
  const code = [];
  let fence;

  markdown.split('\n').forEach((line, index) => {
    const marker = line.match(FENCE)?.[1];

    if (marker && !fence) {
      fence = marker[0];
      code.push({ line: index + 1, text: '' });

      return;
    }

    if (marker && line.trim().startsWith(fence.repeat(3))) {
      fence = undefined;

      return;
    }

    if (fence) code.at(-1).text += `${line}\n`;
    else prose.push({ line: index + 1, text: line });
  });

  for (const { line, text } of prose) {
    for (const [, span] of text.matchAll(CODE_SPAN)) {
      for (const [token] of span.matchAll(TOKEN)) tokens.push({ name: token, line });

      const parts = span.split(/,\s*/);

      if (parts.every((part) => COMPONENT.test(part))) {
        for (const name of parts) components.push({ name, line });
      }
    }
  }

  for (const { line, text } of code) {
    for (const match of text.matchAll(UI_IMPORT)) {
      const at = line + lineOf(text, match.index);

      for (const name of [match[1], ...names(match[2] ?? '')].filter(Boolean)) {
        components.push({ name, line: at });
      }
    }

    for (const match of text.matchAll(JSX_TAG)) {
      components.push({ name: match[1], line: line + lineOf(text, match.index) });
    }

    for (const match of text.matchAll(TOKEN)) {
      tokens.push({ name: match[0], line: line + lineOf(text, match.index) });
    }
  }

  return { tokens, components };
}

export function uiExports(source) {
  return new Set([...source.matchAll(EXPORT_LIST)].flatMap((match) => names(match[1])));
}

export function uiTokens(stylesheets) {
  return new Set(
    stylesheets.flatMap((css) => [...css.matchAll(TOKEN_DEFINITION)].map((match) => match[1])),
  );
}

export function checkDesign({ markdown, exports, tokens, file = DESIGN }) {
  const named = namedInDesign(markdown);
  const problems = [];

  for (const { name, line } of named.tokens) {
    if (!tokens.has(name)) {
      problems.push(`${file}:${line} names token ${name}, which ${UI_SRC} doesn't define`);
    }
  }

  for (const { name, line } of named.components) {
    if (!exports.has(name)) {
      problems.push(`${file}:${line} names ${name}, which @frogbotai/ui doesn't export`);
    }
  }

  return problems;
}

export function readDesign({ root = ROOT } = {}) {
  return {
    markdown: readFileSync(path.join(root, DESIGN), 'utf8'),
    exports: uiExports(readFileSync(path.join(root, UI_INDEX), 'utf8')),
    tokens: uiTokens(
      walk(path.join(root, UI_SRC), /\.css$/).map((file) => readFileSync(file, 'utf8')),
    ),
  };
}

function main() {
  const input = readDesign();
  const problems = checkDesign(input);

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);

    console.error(`\n[check-skill-design] FAIL - ${problems.length} problem(s).`);
    process.exit(1);
  }

  const named = namedInDesign(input.markdown);

  console.log(
    `[check-skill-design] OK - ${named.tokens.length} tokens and ${named.components.length} components found.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

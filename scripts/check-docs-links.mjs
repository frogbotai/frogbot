#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'docs');
const configFile = path.join(root, 'docs.json');
const generalRoots = new Set([
  'access-control',
  'admin',
  'ai',
  'authentication',
  'chat',
  'configuration',
  'connections',
  'custom-components',
  'database',
  'deployment',
  'email',
  'fields',
  'gateway',
  'getting-started',
  'graphql',
  'hooks',
  'jobs-queue',
  'local-api',
  'live-preview',
  'mcp',
  'pieces',
  'plugins',
  'queries',
  'rest-api',
  'rich-text',
  'search',
  'skills',
  'trash',
  'troubleshooting',
  'typescript',
  'upload',
  'versions',
]);
const generalPages = new Set(['index', 'agents/overview']);
const failures = [];

function pageId(file) {
  return path
    .relative(root, file)
    .split(path.sep)
    .join('/')
    .replace(/\.mdx$/, '');
}

function flattenPages(items, pages = []) {
  for (const item of items ?? []) {
    if (typeof item === 'string') pages.push(item.replace(/^\//, '').replace(/\.mdx$/, ''));
    else flattenPages(item.pages, pages);
  }

  return pages;
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.mintlify' || entry.name === 'snippets') continue;

    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) yield* walk(file);
    else if (entry.name.endsWith('.mdx')) yield file;
  }
}

function isOwnedPage(id) {
  if (generalPages.has(id)) return true;

  const [directory] = id.split('/');

  return generalRoots.has(directory);
}

function withoutCode(source) {
  const lines = source.split('\n');
  let fence;

  return lines
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);

      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;

        return '';
      }

      if (fence) return '';

      return line.replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length));
    })
    .join('\n');
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function extractTargets(source) {
  const text = withoutCode(source);
  const targets = [];
  const patterns = [
    {
      image: false,
      regex: /(?<!!)\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/gs,
    },
    { image: true, regex: /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/gs },
    { image: false, regex: /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm },
    { image: false, regex: /\bhref\s*=\s*["']([^"']+)["']/gs },
    { image: true, regex: /\b(?:src|image)\s*=\s*["']([^"']+)["']/gs },
    { image: false, regex: /\bhref\s*=\s*\{\s*["']([^"']+)["']\s*\}/gs },
    { image: true, regex: /\b(?:src|image)\s*=\s*\{\s*["']([^"']+)["']\s*\}/gs },
    { image: false, regex: /\bhref\s*=\s*([^\s"'={}<>`]+)/gs },
    { image: true, regex: /\b(?:src|image)\s*=\s*([^\s"'={}<>`]+)/gs },
  ];

  for (const { image, regex } of patterns) {
    for (const match of text.matchAll(regex)) {
      const target = match.slice(1).find(Boolean);

      targets.push({ image, line: lineAt(text, match.index), target });
    }
  }

  return targets;
}

function normalizeTarget(target, sourceId) {
  if (target.startsWith('#') || /^(?:mailto|tel):/i.test(target)) return;

  let pathname = target;

  if (/^https?:\/\//i.test(target)) {
    const url = new URL(target);

    if (url.hostname !== 'docs.frogbot.ai') return;

    pathname = `${url.pathname}${url.search}${url.hash}`;
  } else if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) {
    return;
  }

  pathname = decodeURIComponent(pathname.split(/[?#]/, 1)[0]);

  if (pathname === '/') return { id: 'index', path: root };

  const sourceDirectory = path.dirname(path.join(root, `${sourceId}.mdx`));
  const resolved = pathname.startsWith('/')
    ? path.resolve(root, `.${pathname}`)
    : path.resolve(sourceDirectory, pathname);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) return { escaped: true };

  return {
    id: relative
      .split(path.sep)
      .join('/')
      .replace(/\.(?:md|mdx)$/, '')
      .replace(/\/$/, ''),
    path: resolved,
  };
}

function report(file, line, target) {
  failures.push(`${path.relative(process.cwd(), file)}:${line}: ${target}`);
}

let config;

try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch (error) {
  console.error(`${path.relative(process.cwd(), configFile)}: ${error.message}`);
  console.error('\n[check-docs-links] FAIL - unable to read docs navigation.');
  process.exit(1);
}

const tabs = config.navigation?.tabs ?? [];
const generalTab = tabs.find((tab) => tab.tab === 'General');

if (!generalTab) failures.push('docs.json: missing General tab');

const navPages = flattenPages(generalTab?.groups);
const otherNavPages = new Set(
  tabs.filter((tab) => tab !== generalTab).flatMap((tab) => flattenPages(tab.groups)),
);
const navCounts = new Map();

for (const id of navPages) navCounts.set(id, (navCounts.get(id) ?? 0) + 1);

for (const [id, count] of navCounts) {
  if (count > 1) failures.push(`docs.json: duplicate General page: ${id}`);
  if (!isOwnedPage(id) || otherNavPages.has(id)) {
    failures.push(`docs.json: non-General page: ${id}`);
  }
  if (!fs.existsSync(path.join(root, `${id}.mdx`))) {
    failures.push(`docs.json: missing General page: ${id}`);
  }
}

const ownedFiles = [...walk(root)].filter((file) => {
  const id = pageId(file);

  return isOwnedPage(id) && !otherNavPages.has(id);
});
const ownedIds = new Set(ownedFiles.map(pageId));

for (const id of ownedIds) {
  if (!navCounts.has(id)) failures.push(`docs.json: unlisted General page: ${id}`);
}

for (const file of ownedFiles) {
  const id = pageId(file);
  const source = fs.readFileSync(file, 'utf8');

  for (const { image, line, target } of extractTargets(source)) {
    const normalized = normalizeTarget(target, id);

    if (!normalized) continue;

    if (normalized.escaped) {
      report(file, line, target);
      continue;
    }

    if (image) {
      if (!fs.existsSync(normalized.path) || fs.statSync(normalized.path).isDirectory()) {
        report(file, line, target);
      }

      continue;
    }

    let destination = normalized.id;

    if (ownedIds.has(`${destination}/index`)) destination = `${destination}/index`;

    if (!ownedIds.has(destination)) report(file, line, target);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);

  console.error(`\n[check-docs-links] FAIL - ${failures.length} issue(s) found.`);
  process.exit(1);
}

console.log(`[check-docs-links] OK - ${ownedFiles.length} General pages scanned.`);

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const tracked = new Set(trackedFiles);

const appRootPattern =
  /^((?:templates|examples)\/[^/]+|test\/(?:[^/]+\/)*fixtures\/[^/]+)\/src\/collections\//;

const appRoots = [
  ...new Set(trackedFiles.flatMap((file) => file.match(appRootPattern)?.[1] ?? [])),
].sort();

const sourcePattern = /\.(?:ts|tsx|js|mjs)$/;
const generatedFiles = new Set(['frogbot-types.ts', 'importMap.js']);
const collectionReferencePattern =
  /(['"`])((?:\.{1,2}|@)\/(?:[^'"`\n]*\/)?collections(?:\/[^'"`\n/]+)?)\1/g;
const importPrefixPattern = /(?:\bfrom\s*|\bimport\s*\(\s*)$/;
const extensionPattern = /\.[cm]?[jt]sx?$/;
const barrelImportPattern = /from ['"](\.{1,2}\/)+(src\/)?collections['"]/;

function collectionEntries(root: string): string[] {
  const prefix = `${root}/src/collections/`;

  const entries = trackedFiles
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length).split('/')[0]);

  return [...new Set(entries)];
}

function resolveCandidates({
  file,
  root,
  specifier,
}: {
  file: string;
  root: string;
  specifier: string;
}): string[] {
  const target = specifier.startsWith('@/')
    ? path.posix.join(root, 'src', specifier.slice(2))
    : path.posix.join(path.posix.dirname(file), specifier);

  if (extensionPattern.test(specifier)) return [target];

  return [`${target}.ts`, `${target}/index.ts`];
}

function importProblems({ file, root }: { file: string; root: string }): string[] {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const problems: string[] = [];

  for (const match of source.matchAll(collectionReferencePattern)) {
    const [literal, , specifier] = match;
    const before = source.slice(0, match.index);

    if (!importPrefixPattern.test(before) || literal.startsWith('`')) {
      problems.push(`${file}: ${literal} is not an import form this guard understands`);

      continue;
    }

    const candidates = resolveCandidates({ file, root, specifier });

    if (!candidates.some((candidate) => tracked.has(candidate))) {
      problems.push(`${file}: '${specifier}' has no tracked match`);
    }
  }

  return problems;
}

describe('collection file layout', () => {
  it('finds the starter template among the apps it checks', () => {
    expect(appRoots).toContain('templates/blank');
  });

  it.each(appRoots)('%s has no src/collections/index.ts', (root) => {
    expect(collectionEntries(root)).not.toContain('index.ts');
  });

  it.each(appRoots)('%s names every collection in TitleCase', (root) => {
    const lowercase = collectionEntries(root).filter((entry) => !/^[A-Z]/.test(entry));

    expect(lowercase).toEqual([]);
  });

  it.each(appRoots)('%s imports collections by their recorded file names', (root) => {
    const sources = trackedFiles.filter(
      (file) =>
        file.startsWith(`${root}/`) &&
        sourcePattern.test(file) &&
        !generatedFiles.has(path.posix.basename(file)),
    );

    expect(sources.flatMap((file) => importProblems({ file, root }))).toEqual([]);
  });

  it('docs and skill guides never import a collections barrel', () => {
    const guides = trackedFiles.filter(
      (file) =>
        (file.startsWith('docs/') && file.endsWith('.mdx')) ||
        (file.startsWith('skills/') && file.endsWith('.md')),
    );

    const barrels = guides.flatMap((file) =>
      readFileSync(path.join(repoRoot, file), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          barrelImportPattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
        ),
    );

    expect(barrels).toEqual([]);
  });
});

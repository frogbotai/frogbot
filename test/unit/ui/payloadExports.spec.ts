import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { collisions, root, rsc, shared } from './payloadExports/classification.js';

type ExportNames = {
  types: string[];
  values: string[];
};

const packageRoot = path.resolve('packages/ui');
const requireFromUI = createRequire(path.join(packageRoot, 'package.json'));
const payloadClientEntry = requireFromUI.resolve('@payloadcms/ui');
const payloadExportsRoot = path.dirname(payloadClientEntry);

function readExports(file: string): ExportNames {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const exports: ExportNames = { types: [], values: [] };

  source.statements.forEach((statement) => {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      return;
    }

    statement.exportClause.elements.forEach((element) => {
      const collection =
        statement.isTypeOnly || element.isTypeOnly ? exports.types : exports.values;

      collection.push(element.name.text);
    });
  });

  return exports;
}

function expectClassification(upstream: ExportNames, groups: Array<ExportNames>, label: string) {
  for (const kind of ['values', 'types'] as const) {
    const classified = groups.flatMap((group) => group[kind]);
    const duplicates = classified.filter((name, index) => classified.indexOf(name) !== index);
    const unclassified = upstream[kind].filter((name) => !classified.includes(name));
    const unknown = classified.filter((name) => !upstream[kind].includes(name));

    expect(duplicates, `${label} has duplicated ${kind}`).toEqual([]);
    expect(unclassified, `${label} has unclassified ${kind}`).toEqual([]);
    expect(unknown, `${label} classifies unknown ${kind}`).toEqual([]);
  }
}

function expectEntry(file: string, expected: ExportNames, specifier: string) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);

  source.statements.forEach((statement) => {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) return;

    expect((statement.moduleSpecifier as ts.StringLiteral).text).toBe(specifier);
  });

  const actual = readExports(file);

  expect(new Set(actual.values)).toEqual(new Set(expected.values));
  expect(new Set(actual.types)).toEqual(new Set(expected.types));
}

describe('Payload UI export classification', () => {
  it('classifies every @payloadcms/ui root export exactly once', () => {
    const upstream = readExports(path.join(payloadExportsRoot, 'index.d.ts'));

    expectClassification(upstream, [root.tier1, root.tier2, root.excluded], 'root');
  });

  it('classifies every @payloadcms/ui shared export exactly once', () => {
    const upstream = readExports(path.join(payloadExportsRoot, '../shared/index.d.ts'));

    expectClassification(upstream, [shared.included, shared.excluded], 'shared');
  });

  it('classifies every @payloadcms/ui rsc export exactly once', () => {
    const upstream = readExports(path.join(payloadExportsRoot, '../rsc/index.d.ts'));

    expectClassification(upstream, [rsc.included, rsc.excluded], 'rsc');
  });

  it('exports only classified included names from the FrogBot entries', () => {
    expectEntry(
      path.join(packageRoot, 'src/exports/client/index.ts'),
      {
        values: [...root.tier1.values, ...root.tier2.values],
        types: [...root.tier1.types, ...root.tier2.types],
      },
      '@payloadcms/ui',
    );
    expectEntry(
      path.join(packageRoot, 'src/exports/shared/index.ts'),
      shared.included,
      '@payloadcms/ui/shared',
    );
    expectEntry(
      path.join(packageRoot, 'src/exports/rsc/index.ts'),
      rsc.included,
      '@payloadcms/ui/rsc',
    );
  });

  it('keeps collision names bound to FrogBot modules', () => {
    const file = path.join(packageRoot, 'src/index.ts');
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const localNames = new Set<string>();

    source.statements.forEach((statement) => {
      if (
        !ts.isExportDeclaration(statement) ||
        !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause) ||
        !statement.moduleSpecifier ||
        !(statement.moduleSpecifier as ts.StringLiteral).text.startsWith('./')
      ) {
        return;
      }

      statement.exportClause.elements.forEach((element) => localNames.add(element.name.text));
    });

    for (const collision of collisions) expect(localNames.has(collision), collision).toBe(true);

    const clientNames = new Set([...root.tier1.values, ...root.tier2.values]);
    const duplicates = [...localNames].filter((name) => clientNames.has(name));

    expect(duplicates, 'root exports a local name and an upstream name').toEqual([]);
  });
});

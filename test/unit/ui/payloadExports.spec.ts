import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { adminOverrides, collisions, root, rsc, shared } from './payloadExports/classification.js';

type ExportNames = {
  types: string[];
  values: string[];
};

const packageRoot = path.resolve('packages/ui');
const requireFromUI = createRequire(path.join(packageRoot, 'package.json'));
const payloadClientEntry = requireFromUI.resolve('@payloadcms/ui');
const payloadExportsRoot = path.dirname(payloadClientEntry);

function readExports(file: string, from?: string): ExportNames {
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

    if (from && (statement.moduleSpecifier as ts.StringLiteral | undefined)?.text !== from) return;

    statement.exportClause.elements.forEach((element) => {
      const collection =
        statement.isTypeOnly || element.isTypeOnly ? exports.types : exports.values;

      collection.push(element.name.text);
    });
  });

  return exports;
}

function exportSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  return source.statements.flatMap((statement) =>
    ts.isExportDeclaration(statement) && statement.moduleSpecifier
      ? [(statement.moduleSpecifier as ts.StringLiteral).text]
      : [],
  );
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
  for (const from of exportSpecifiers(file)) {
    expect(from === specifier || from.startsWith('../'), `${file} re-exports ${from}`).toBe(true);
  }

  const actual = readExports(file, specifier);

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

  it('exports only classified included names from the admin entries', () => {
    expectEntry(
      path.join(packageRoot, 'src/admin/exports/client.ts'),
      {
        values: [...root.tier1.values, ...root.tier2.values].filter(
          (name) => !adminOverrides.client.includes(name),
        ),
        types: [...root.tier1.types, ...root.tier2.types],
      },
      '@payloadcms/ui',
    );

    expectEntry(
      path.join(packageRoot, 'src/admin/exports/shared.ts'),
      shared.included,
      '@payloadcms/ui/shared',
    );

    expectEntry(
      path.join(packageRoot, 'src/admin/exports/rsc.ts'),
      {
        values: rsc.included.values.filter((name) => !adminOverrides.rsc.includes(name)),
        types: rsc.included.types.filter((name) => !adminOverrides.rsc.includes(name)),
      },
      '@payloadcms/ui/rsc',
    );
  });

  it.each([
    { entry: 'client', specifier: '@payloadcms/ui' },
    { entry: 'rsc', specifier: '@payloadcms/ui/rsc' },
  ] as const)(
    "binds each $entry admin override to FrogBot's own module",
    ({ entry, specifier }) => {
      const file = path.join(packageRoot, `src/admin/exports/${entry}.ts`);
      const local = readExports(file);
      const payload = readExports(file, specifier);

      for (const name of adminOverrides[entry]) {
        expect([...local.values, ...local.types], name).toContain(name);
        expect([...payload.values, ...payload.types], name).not.toContain(name);
      }
    },
  );

  it('keeps every Payload name out of the root entry', () => {
    expect(
      exportSpecifiers(path.join(packageRoot, 'src/index.ts')).filter(
        (from) => !from.startsWith('./') || from.startsWith('./admin/'),
      ),
    ).toEqual([]);
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

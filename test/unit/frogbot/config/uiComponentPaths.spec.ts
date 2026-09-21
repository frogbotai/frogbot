import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { SanitizedConfig } from 'payload';
import { parsePayloadComponent } from 'payload/shared';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  rewriteComponentPaths,
  rewritePayloadComponent,
} from '../../../../packages/frogbot/src/config/rewriteComponentPaths.js';
import { uiComponentExports } from '../../../../packages/frogbot/src/config/uiComponentExports.js';
import { root, rsc, shared } from '../../ui/payloadExports/classification.js';

const requireFromUI = createRequire(path.resolve('packages/ui/package.json'));
const entries = [
  {
    source: '@payloadcms/ui',
    destination: '@frogbotai/ui',
    bridge: 'client',
    included: [...root.tier1.values, ...root.tier2.values],
    excluded: [
      ...root.excluded.values,
      ...root.excluded.types,
      ...root.tier1.types,
      ...root.tier2.types,
    ],
  },
  {
    source: '@payloadcms/ui/shared',
    destination: '@frogbotai/ui/shared',
    bridge: 'shared',
    included: shared.included.values,
    excluded: [...shared.excluded.values, ...shared.excluded.types],
  },
  {
    source: '@payloadcms/ui/rsc',
    destination: '@frogbotai/ui/rsc',
    bridge: 'rsc',
    included: rsc.included.values,
    excluded: rsc.excluded.values,
  },
];

function runtimeExports(file: string): Map<string, string | undefined> {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const exports = new Map<string, string | undefined>();

  for (const statement of source.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.isTypeOnly ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }

    const specifier = statement.moduleSpecifier as ts.StringLiteral | undefined;

    for (const element of statement.exportClause.elements) {
      if (!element.isTypeOnly) exports.set(element.name.text, specifier?.text);
    }
  }

  return exports;
}

describe('UI component destinations', () => {
  it.each(entries)('resolves every curated $source destination and forwarded export', (entry) => {
    const resolved = requireFromUI.resolve(entry.destination);
    const bridgePath = path.resolve(`packages/ui/src/exports/${entry.bridge}/index.ts`);
    const bridge = runtimeExports(bridgePath);
    const upstreamPath = requireFromUI.resolve(entry.source).replace(/\.js$/, '.d.ts');
    const upstream = runtimeExports(upstreamPath);

    expect(fs.statSync(resolved).isFile()).toBe(true);
    expect(uiComponentExports[entry.source]).toEqual(new Set(entry.included));
    expect(new Set(bridge.keys())).toEqual(uiComponentExports[entry.source]);

    expect(resolved).toBe(
      entry.bridge === 'client' ? path.resolve('packages/ui/src/index.ts') : bridgePath,
    );

    for (const name of entry.included) {
      const rewritten = rewritePayloadComponent(`${entry.source}#${name}`);
      const component = parsePayloadComponent(rewritten);

      expect(component).toEqual({ path: entry.destination, exportName: name });
      expect(requireFromUI.resolve(component.path)).toBe(resolved);
      expect(bridge.get(name)).toBe(entry.source);
      expect(upstream.has(name)).toBe(true);
    }
  });

  it('connects the public UI root to the curated client exports', () => {
    const rootPath = requireFromUI.resolve('@frogbotai/ui');

    expect(fs.readFileSync(rootPath, 'utf8')).toContain(
      "export * from './exports/client/index.js'",
    );
  });

  it.each(entries)('preserves excluded and unknown $source references', (entry) => {
    for (const name of [...entry.excluded, 'UnknownComponent', 'default']) {
      const reference = `${entry.source}#${name}`;

      expect(rewritePayloadComponent(reference)).toBe(reference);
      expect(rewritePayloadComponent({ path: entry.source, exportName: name })).toEqual({
        path: entry.source,
        exportName: name,
      });
    }

    expect(rewritePayloadComponent(entry.source)).toBe(entry.source);
  });

  it('preserves unsupported deep subpaths and neighbouring packages', () => {
    for (const reference of [
      '@payloadcms/ui/fields/Text#TextField',
      '@payloadcms/ui/elements/RenderServerComponent#RenderServerComponent',
      '@payloadcms/ui/icons/Check#CheckIcon',
      '@payloadcms/ui/unknown#TextField',
      '@payloadcms/ui-other#TextField',
      '/components/ColorField#ColorField',
    ]) {
      expect(rewritePayloadComponent(reference)).toBe(reference);
    }
  });

  it('uses explicit export names with upstream precedence and preserves component props', () => {
    const clientProps = { label: 'Title' };
    const serverProps = { required: true };
    const component = {
      path: '@payloadcms/ui#Button',
      exportName: 'TextField',
      clientProps,
      serverProps,
    };
    const rewritten = rewritePayloadComponent(component);

    expect(parsePayloadComponent(rewritten)).toEqual({
      path: '@frogbotai/ui',
      exportName: 'TextField',
    });
    expect(rewritten.clientProps).toBe(clientProps);
    expect(rewritten.serverProps).toBe(serverProps);
    expect(rewritePayloadComponent({ path: '@payloadcms/ui', exportName: 'TextField' })).toEqual({
      path: '@frogbotai/ui',
      exportName: 'TextField',
    });
    expect(
      rewritePayloadComponent({ path: '@payloadcms/ui#TextField', exportName: 'Button' }),
    ).toEqual({ path: '@payloadcms/ui#TextField', exportName: 'Button' });
    expect(rewritePayloadComponent(rewritten)).toEqual(rewritten);
  });

  it('keeps dependency keys aligned with explicit supported exports', () => {
    const config = {
      admin: {
        dependencies: {
          '@payloadcms/ui/shared#formatAdminURL': {
            type: 'function',
            path: '@payloadcms/ui/shared',
            exportName: 'formatAdminURL',
          },
          '@payloadcms/ui#Button': { type: 'component', path: '@payloadcms/ui#Button' },
        },
      },
    } as unknown as SanitizedConfig;

    rewriteComponentPaths(config);

    expect(config.admin.dependencies).toEqual({
      '@frogbotai/ui/shared#formatAdminURL': {
        type: 'function',
        path: '@frogbotai/ui/shared',
        exportName: 'formatAdminURL',
      },
      '@payloadcms/ui#Button': { type: 'component', path: '@payloadcms/ui#Button' },
    });
  });
});

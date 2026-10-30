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
import { adminOverrides, root, rsc, shared } from '../../ui/payloadExports/classification.js';

const requireFromUI = createRequire(path.resolve('packages/ui/package.json'));
const entries = [
  {
    source: '@payloadcms/ui',
    destination: '@frogbotai/ui/admin',
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
    destination: '@frogbotai/ui/admin/shared',
    bridge: 'shared',
    included: shared.included.values,
    excluded: [...shared.excluded.values, ...shared.excluded.types],
  },
  {
    source: '@payloadcms/ui/rsc',
    destination: '@frogbotai/ui/admin/rsc',
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
    const bridgePath = path.resolve(`packages/ui/src/admin/exports/${entry.bridge}.ts`);
    const bridgeExports = runtimeExports(bridgePath);
    const bridge = new Map(
      [...bridgeExports].filter(([, specifier]) => specifier === entry.source),
    );

    const upstreamPath = requireFromUI.resolve(entry.source).replace(/\.js$/, '.d.ts');
    const upstream = runtimeExports(upstreamPath);

    expect(fs.statSync(resolved).isFile()).toBe(true);
    expect(uiComponentExports[entry.source]).toEqual(new Set(entry.included));

    const overrides = (
      entry.bridge === 'shared' ? [] : adminOverrides[entry.bridge as keyof typeof adminOverrides]
    ).filter((name: string) => entry.included.includes(name));

    expect(new Set([...bridge.keys(), ...overrides])).toEqual(uiComponentExports[entry.source]);

    expect(resolved).toBe(bridgePath);

    for (const name of entry.included) {
      const rewritten = rewritePayloadComponent(`${entry.source}#${name}`);
      const component = parsePayloadComponent(rewritten);

      expect(component).toEqual({ path: entry.destination, exportName: name });
      expect(requireFromUI.resolve(component.path)).toBe(resolved);
      expect(bridgeExports.get(name)).toMatch(
        overrides.includes(name) ? /^\.\.\// : new RegExp(`^${entry.source}$`),
      );
      expect(upstream.has(name)).toBe(true);
    }
  });

  it('rewrites a curated Payload path to the admin entry', () => {
    expect(rewritePayloadComponent('@payloadcms/ui#FieldLabel')).toBe(
      '@frogbotai/ui/admin#FieldLabel',
    );
  });

  it('keeps the curated client exports out of the public UI root', () => {
    const rootExports = runtimeExports(requireFromUI.resolve('@frogbotai/ui'));

    expect([...rootExports.values()].filter((specifier) => !specifier?.startsWith('./'))).toEqual(
      [],
    );
    expect(fs.readFileSync(requireFromUI.resolve('@frogbotai/ui'), 'utf8')).not.toContain('admin/');
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
      path: '@frogbotai/ui/admin',
      exportName: 'TextField',
    });
    expect(rewritten.clientProps).toBe(clientProps);
    expect(rewritten.serverProps).toBe(serverProps);
    expect(rewritePayloadComponent({ path: '@payloadcms/ui', exportName: 'TextField' })).toEqual({
      path: '@frogbotai/ui/admin',
      exportName: 'TextField',
    });
    expect(
      rewritePayloadComponent({ path: '@payloadcms/ui#TextField', exportName: 'Banner' }),
    ).toEqual({ path: '@payloadcms/ui#TextField', exportName: 'Banner' });
    expect(rewritePayloadComponent(rewritten)).toEqual(rewritten);
  });

  it('keeps dependency keys aligned with explicit supported exports', () => {
    const config = {
      admin: {
        dependencies: {
          '@payloadcms/ui/shared#formatDate': {
            type: 'function',
            path: '@payloadcms/ui/shared',
            exportName: 'formatDate',
          },
          '@payloadcms/ui#Banner': { type: 'component', path: '@payloadcms/ui#Banner' },
        },
      },
    } as unknown as SanitizedConfig;

    rewriteComponentPaths(config);

    expect(config.admin.dependencies).toEqual({
      '@frogbotai/ui/admin/shared#formatDate': {
        type: 'function',
        path: '@frogbotai/ui/admin/shared',
        exportName: 'formatDate',
      },
      '@payloadcms/ui#Banner': { type: 'component', path: '@payloadcms/ui#Banner' },
    });
  });
});

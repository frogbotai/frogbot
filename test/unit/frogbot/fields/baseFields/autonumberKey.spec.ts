import { flattenAllFields } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { sanitizeCollection } from '../../../../../packages/frogbot/src/collections/config/sanitize.js';
import type { CollectionConfig } from '../../../../../packages/frogbot/src/collections/config/types.js';
import type { AutonumberEntry } from '../../../../../packages/frogbot/src/config/sanitized.js';
import { autonumberField } from '../../../../../packages/frogbot/src/fields/baseFields/autonumber/index.js';
import {
  autonumberKeyField,
  resolveAutonumberKeys,
} from '../../../../../packages/frogbot/src/fields/baseFields/autonumber/key.js';
import { runHook, runSchema } from './systemKind.js';

const description = 'Unique key set by FrogBot as <key>-<number>, like APP-123; read-only';

const project = {
  name: 'project',
  type: 'relationship',
  relationTo: 'projects',
  required: true,
} as const;

const prefix = { name: 'key', type: 'text', required: true, unique: true } as const;

function sanitize(slug: string, fields: CollectionConfig['fields']) {
  const autonumbers: AutonumberEntry[] = [];
  const onAutonumberKey = vi.fn();
  const collection = sanitizeCollection({ slug, fields }, vi.fn(), {
    onAutonumber: (path, scope) => autonumbers.push({ collection: slug, path, scope }),
    onAutonumberKey,
    resolveFrogBot: vi.fn(),
  });

  return { autonumbers, collection, onAutonumberKey };
}

function resolve({
  issueFields = [
    project,
    autonumberField({ name: 'number', scope: 'project' }),
    autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' }),
  ],
  projectFields = [prefix],
}: {
  issueFields?: CollectionConfig['fields'];
  projectFields?: CollectionConfig['fields'];
} = {}) {
  const issues = sanitize('issues', issueFields);
  const projects = sanitize('projects', projectFields);
  const built = [issues, projects].map(({ collection }) => ({
    slug: collection.slug,
    flattenedFields: flattenAllFields({ fields: collection.fields }),
    hooks: { afterChange: [] as unknown[], afterDelete: undefined as unknown[] | undefined },
  }));

  const declarations = issues.onAutonumberKey.mock.calls.map(([path, key]) => ({
    collection: 'issues',
    path: path as string,
    ...(key as { number: { name: string; path: string }; prefix: string }),
  }));

  return {
    built,
    entries: resolveAutonumberKeys({
      autonumbers: issues.autonumbers,
      collections: built,
      declarations,
    }),
  };
}

describe('autonumberKeyField', () => {
  it('returns a unique, read-only text field marked with its kind', () => {
    const field = autonumberKeyField({
      name: 'key',
      number: 'number',
      prefix: 'key',
      admin: { position: 'sidebar' },
    });

    expect(field).toMatchObject({
      type: 'text',
      name: 'key',
      unique: true,
      admin: { position: 'sidebar', readOnly: true },
    });
    expect(field).not.toHaveProperty('number');
    expect(field).not.toHaveProperty('prefix');
    expect(field.admin?.custom).toEqual({
      frogbot: { kind: { type: 'autonumberKey', number: 'number', prefix: 'key' } },
    });
  });

  it('denies create and update access and keeps read access', () => {
    const read = () => true;
    const field = autonumberKeyField({
      name: 'key',
      number: 'number',
      prefix: 'key',
      access: { read },
    });

    expect(field.access?.read).toBe(read);
    expect((field.access?.create as () => boolean)()).toBe(false);
    expect((field.access?.update as () => boolean)()).toBe(false);
  });

  it('tells agents how the key is built', () => {
    const field = autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' });

    expect(runSchema(field, { type: ['string', 'null'] })).toEqual({
      type: ['string', 'null'],
      description,
    });
  });

  it('clears the key on duplicate', () => {
    const field = autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' });

    expect(runHook(field, 'beforeDuplicate', { value: 'APP-1' })).toBeUndefined();
  });

  it.each([
    [{ hasMany: true }, 'hasMany is not supported'],
    [{ localized: true }, 'localized is not supported'],
    [{ defaultValue: 'APP-1' }, 'defaultValue is not supported'],
    [{ required: true }, 'required is not supported'],
    [{ unique: false }, 'unique is not supported'],
    [{ virtual: true }, 'virtual is not supported'],
    [{ access: { create: () => true } }, 'access.create is not supported'],
    [{ access: { update: () => true } }, 'access.update is not supported'],
  ])('rejects %o at call time', (options, message) => {
    expect(() =>
      autonumberKeyField({ name: 'key', number: 'number', prefix: 'key', ...(options as object) }),
    ).toThrow(new Error(`autonumberKeyField "key": ${message}`));
  });

  it('reports the key and its sibling number when sanitized, inside a group too', () => {
    const { onAutonumberKey } = sanitize('issues', [
      {
        name: 'details',
        type: 'group',
        fields: [
          project,
          autonumberField({ name: 'ref', scope: 'project' }),
          autonumberKeyField({ name: 'key', number: 'ref', prefix: 'key' }),
        ],
      },
    ]);

    expect(onAutonumberKey).toHaveBeenCalledWith('details.key', {
      number: { name: 'ref', path: 'details.ref' },
      prefix: 'key',
    });
  });

  it("can't be inside an array", () => {
    expect(() =>
      sanitize('issues', [
        {
          name: 'items',
          type: 'array',
          fields: [autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' })],
        },
      ]),
    ).toThrow(
      "[frogbot] Autonumber key field 'items.key' in collection 'issues' can't be inside an array or blocks.",
    );
  });
});

describe('resolveAutonumberKeys', () => {
  it('resolves the number, its scope and the prefix collection', () => {
    expect(resolve().entries).toEqual([
      {
        collection: 'issues',
        path: 'key',
        number: {
          collection: 'issues',
          path: 'number',
          scope: { name: 'project', path: 'project' },
        },
        prefix: { collection: 'projects', path: 'key' },
      },
    ]);
  });

  it('adds one rename hook to the prefix collection only', () => {
    const { built } = resolve();

    expect(built.find(({ slug }) => slug === 'projects')?.hooks.afterChange).toHaveLength(1);
    expect(built.find(({ slug }) => slug === 'issues')?.hooks.afterChange).toHaveLength(0);
  });

  it("adds one hook that forgets a deleted record's old keys to the keyed collection only", () => {
    const { built } = resolve();

    expect(built.find(({ slug }) => slug === 'issues')?.hooks.afterDelete).toHaveLength(1);
    expect(built.find(({ slug }) => slug === 'projects')?.hooks.afterDelete).toBeUndefined();
  });

  const numberError =
    "[frogbot] Autonumber key field 'key' in collection 'issues' has number 'number', which must be an autonumberField with a scope beside it.";

  it.each([
    ['missing', [project]],
    ['not scoped', [project, autonumberField({ name: 'number' })]],
    ['a plain number', [project, { name: 'number', type: 'number' }]],
  ])('fails at startup when the number is %s', (_label, fields) => {
    expect(() =>
      resolve({
        issueFields: [
          ...(fields as CollectionConfig['fields']),
          autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' }),
        ],
      }),
    ).toThrow(new Error(numberError));
  });

  const prefixError =
    "[frogbot] Autonumber key field 'key' in collection 'issues' has prefix 'key', which must be a required, unique text field in collection 'projects', not localized or hasMany.";

  it.each([
    ['missing', []],
    ['optional', [{ ...prefix, required: false }]],
    ['not unique', [{ ...prefix, unique: false }]],
    ['localized', [{ ...prefix, localized: true }]],
    ['hasMany', [{ ...prefix, hasMany: true }]],
    ['not text', [{ name: 'key', type: 'number', required: true, unique: true }]],
  ])('fails at startup when the prefix is %s', (_label, projectFields) => {
    expect(() => resolve({ projectFields: projectFields as CollectionConfig['fields'] })).toThrow(
      new Error(prefixError),
    );
  });
});

import { describe, expect, it } from 'vitest';

import type {
  Field,
  GroupField,
  Option,
  Tab,
  TabAsField,
} from '../../../../packages/frogbot/src/index.js';
import {
  fieldAffectsData,
  fieldHasMaxDepth,
  fieldHasSubFields,
  fieldIsArrayType,
  fieldIsBlockType,
  fieldIsGroupType,
  fieldIsHiddenOrDisabled,
  fieldIsID,
  fieldIsLocalized,
  fieldIsPresentationalOnly,
  fieldIsSidebar,
  fieldIsVirtual,
  fieldShouldBeLocalized,
  fieldSupportsMany,
  groupHasName,
  optionIsObject,
  optionIsValue,
  optionsAreObjects,
  tabHasName,
  valueIsValueWithRelation,
} from '../../../../packages/frogbot/src/index.js';

describe('field type guards', () => {
  const text = { name: 'title', type: 'text' } satisfies Field;
  const array = { name: 'items', type: 'array', fields: [] } satisfies Field;
  const blocks = { name: 'layout', type: 'blocks', blocks: [] } satisfies Field;
  const group = { name: 'details', type: 'group', fields: [] } satisfies Field;
  const row = { type: 'row', fields: [] } satisfies Field;
  const collapsible = { type: 'collapsible', label: 'More', fields: [] } satisfies Field;
  const syntheticTab = { type: 'tab', label: 'Tab', fields: [] } satisfies TabAsField;

  it.each([
    ['array', array, true],
    ['group', group, true],
    ['row', row, true],
    ['collapsible', collapsible, true],
    ['blocks', blocks, false],
    ['text', text, false],
  ])('fieldHasSubFields handles %s fields', (_name, field, expected) => {
    expect(fieldHasSubFields(field)).toBe(expected);
  });

  it.each([
    [fieldIsArrayType, array, blocks],
    [fieldIsBlockType, blocks, array],
    [fieldIsGroupType, group, text],
  ])(
    'concrete field guards distinguish matching and non-matching types',
    (guard, matching, other) => {
      expect(guard(matching as never)).toBe(true);
      expect(guard(other as never)).toBe(false);
    },
  );

  it('fieldIsPresentationalOnly handles UI fields and synthetic tabs', () => {
    const ui = { name: 'notice', type: 'ui' } satisfies Field;

    expect(fieldIsPresentationalOnly(ui)).toBe(true);
    expect(fieldIsPresentationalOnly(syntheticTab)).toBe(false);
    expect(fieldIsPresentationalOnly(text)).toBe(false);
  });

  it.each([
    [{ name: 'choice', type: 'select', options: [] } satisfies Field, true],
    [{ name: 'author', type: 'relationship', relationTo: 'users' } satisfies Field, true],
    [{ name: 'image', type: 'upload', relationTo: 'media' } satisfies Field, true],
    [text, false],
  ])('fieldSupportsMany matches runtime capabilities', (field, expected) => {
    expect(fieldSupportsMany(field)).toBe(expected);
  });

  it.each([
    [
      { name: 'author', type: 'relationship', relationTo: 'users', maxDepth: 1 } satisfies Field,
      true,
    ],
    [{ name: 'image', type: 'upload', relationTo: 'media', maxDepth: 1 } satisfies Field, true],
    [
      {
        name: 'posts',
        type: 'join',
        collection: 'posts',
        on: 'author',
        maxDepth: 1,
      } satisfies Field,
      true,
    ],
    [{ name: 'author', type: 'relationship', relationTo: 'users' } satisfies Field, false],
    [text, false],
  ])('fieldHasMaxDepth requires a numeric maxDepth on supported fields', (field, expected) => {
    expect(fieldHasMaxDepth(field)).toBe(expected);
  });

  it('fieldAffectsData distinguishes named data fields from presentation containers', () => {
    const namedTab = { name: 'content', fields: [] } satisfies Tab;
    const unnamedGroup = { type: 'group', fields: [] } satisfies GroupField;

    expect(fieldAffectsData(text)).toBe(true);
    expect(fieldAffectsData(namedTab as never)).toBe(true);
    expect(fieldAffectsData(unnamedGroup)).toBe(false);
    expect(fieldAffectsData(syntheticTab)).toBe(false);
    expect(fieldAffectsData({ ...syntheticTab, name: 'content' })).toBe(true);
    expect(fieldAffectsData(row)).toBe(false);
    expect(fieldAffectsData(collapsible)).toBe(false);
  });

  it('metadata guards handle absent and adversarial metadata', () => {
    const sidebar = {
      name: 'status',
      type: 'text',
      admin: { position: 'sidebar' },
    } satisfies Field;
    const disabled = { name: 'locked', type: 'text', admin: { disabled: true } } satisfies Field;
    const hidden = { name: 'hidden', type: 'text', hidden: true } satisfies Field;
    const adminHidden = { name: 'shown', type: 'text', admin: { hidden: true } } satisfies Field;

    expect(fieldIsSidebar(sidebar)).toBe(true);
    expect(fieldIsSidebar(text)).toBe(false);
    expect(fieldIsHiddenOrDisabled(disabled)).toBe(true);
    expect(fieldIsHiddenOrDisabled(hidden)).toBe(true);
    expect(fieldIsHiddenOrDisabled(adminHidden)).toBe(false);
    expect(fieldIsHiddenOrDisabled(text)).toBe(false);
  });

  it.each([false, true])(
    'fieldIsHiddenOrDisabled preserves hidden=%s with undefined admin',
    (hidden) => {
      const field = { name: 'title', type: 'text', admin: undefined, hidden } satisfies Field;

      expect(fieldIsHiddenOrDisabled(field)).toBe(hidden);
      expect(field.admin).toBeUndefined();
    },
  );

  it('fieldIsHiddenOrDisabled accepts explicitly undefined admin', () => {
    const field = { name: 'title', type: 'text', admin: undefined } satisfies Field;

    expect(fieldIsHiddenOrDisabled(field)).toBe(false);
    expect(field.admin).toBeUndefined();
  });

  it('fieldIsID matches only the id name', () => {
    expect(fieldIsID({ name: 'id', type: 'text' })).toBe(true);
    expect(fieldIsID(text)).toBe(false);
  });

  it('localization helpers account for parent localization', () => {
    const localized = { name: 'title', type: 'text', localized: true } satisfies Field;
    const localizedTab = { name: 'content', localized: true, fields: [] } satisfies Tab;

    expect(fieldIsLocalized(localized)).toBe(true);
    expect(fieldIsLocalized(localizedTab)).toBe(true);
    expect(fieldIsLocalized(text)).toBe(false);
    expect(fieldShouldBeLocalized({ field: localized, parentIsLocalized: false })).toBe(true);
    expect(fieldShouldBeLocalized({ field: localized, parentIsLocalized: true })).toBe(false);
    expect(fieldShouldBeLocalized({ field: text, parentIsLocalized: false })).toBe(false);
  });

  it('fieldIsVirtual handles fields and tabs', () => {
    const virtual = { name: 'summary', type: 'text', virtual: true } satisfies Field;
    const virtualTab = { name: 'computed', virtual: true, fields: [] } satisfies Tab;

    expect(fieldIsVirtual(virtual)).toBe(true);
    expect(fieldIsVirtual(virtualTab)).toBe(true);
    expect(fieldIsVirtual(text)).toBe(false);
  });

  it('name guards distinguish named and unnamed tabs and groups', () => {
    const namedTab = { name: 'content', fields: [] } satisfies Tab;
    const unnamedTab = { label: 'Content', fields: [] } satisfies Tab;
    const namedGroup = { name: 'details', type: 'group', fields: [] } satisfies GroupField;
    const unnamedGroup = { type: 'group', fields: [] } satisfies GroupField;

    expect(tabHasName(namedTab)).toBe(true);
    expect(tabHasName(unnamedTab)).toBe(false);
    expect(groupHasName(namedGroup)).toBe(true);
    expect(groupHasName(unnamedGroup)).toBe(false);
  });

  it('option guards preserve first-element runtime semantics', () => {
    const objectOption: Option = { label: 'Published', value: 'published' };
    const valueOption: Option = 'draft';

    expect(optionIsObject(objectOption)).toBe(true);
    expect(optionIsObject(valueOption)).toBe(false);
    expect(optionIsValue(valueOption)).toBe(true);
    expect(optionIsValue(objectOption)).toBe(false);
    expect(optionsAreObjects([])).toBe(false);
    expect(optionsAreObjects([objectOption])).toBe(true);
    expect(optionsAreObjects([objectOption, valueOption])).toBe(true);
    expect(optionsAreObjects([valueOption, objectOption])).toBe(false);
  });

  it('valueIsValueWithRelation rejects null and incomplete values', () => {
    expect(valueIsValueWithRelation(null)).toBe(false);
    expect(valueIsValueWithRelation({})).toBe(false);
    expect(valueIsValueWithRelation({ relationTo: 'users' })).toBe(false);
    expect(valueIsValueWithRelation({ value: 1 })).toBe(false);
    expect(valueIsValueWithRelation({ relationTo: 'users', value: 1 })).toBe(true);
  });
});

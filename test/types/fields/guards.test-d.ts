import {
  type Field,
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
  type GroupField,
  groupHasName,
  type NamedGroupField,
  type NamedTab,
  type Option,
  optionIsObject,
  optionIsValue,
  type OptionObject,
  optionsAreObjects,
  type Tab,
  type TabAsField,
  tabHasName,
  valueIsValueWithRelation,
  type ValueWithRelation,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const field: Field & { extra: 'preserved' };
declare const fieldOrTab: Field | Tab;
declare const fieldOrSyntheticTab: Field | TabAsField;

if (fieldHasSubFields(field)) {
  expectTypeOf(field.fields).toMatchTypeOf<Field[]>();
  expectTypeOf(field.extra).toEqualTypeOf<'preserved'>();
}

if (fieldIsArrayType(field)) {
  expectTypeOf(field.type).toEqualTypeOf<'array'>();
  expectTypeOf(field.extra).toEqualTypeOf<'preserved'>();
}

if (fieldIsBlockType(field)) {
  expectTypeOf(field.type).toEqualTypeOf<'blocks'>();
  expectTypeOf(field.blocks).toMatchTypeOf<object[]>();
}

if (fieldIsGroupType(field)) {
  expectTypeOf(field.type).toEqualTypeOf<'group'>();
  expectTypeOf(field.fields).toMatchTypeOf<Field[]>();
}

if (fieldSupportsMany(field)) {
  expectTypeOf(field.type).toMatchTypeOf<'relationship' | 'select' | 'upload'>();
  expectTypeOf(field.extra).toEqualTypeOf<'preserved'>();
}

if (fieldHasMaxDepth(field)) {
  expectTypeOf(field.type).toMatchTypeOf<'join' | 'relationship' | 'upload'>();
  expectTypeOf(field.maxDepth).toEqualTypeOf<number>();
}

if (fieldIsPresentationalOnly(fieldOrSyntheticTab)) {
  expectTypeOf(fieldOrSyntheticTab.type).toMatchTypeOf<'tab' | 'ui'>();
}

if (fieldAffectsData(fieldOrSyntheticTab)) {
  expectTypeOf(fieldOrSyntheticTab).not.toMatchTypeOf<{ type: 'ui' }>();
  expectTypeOf(fieldOrSyntheticTab.name).toEqualTypeOf<string>();
  expectTypeOf<Extract<typeof fieldOrSyntheticTab, { type: 'row' | 'collapsible' }>>().toBeNever();
}

if (fieldAffectsData(field)) {
  expectTypeOf(field.name).toEqualTypeOf<string>();
  expectTypeOf(field.extra).toEqualTypeOf<'preserved'>();
}

declare const syntheticTab: TabAsField;

if (fieldAffectsData(syntheticTab)) {
  expectTypeOf(syntheticTab.name).toEqualTypeOf<string>();
  expectTypeOf(syntheticTab.type).toEqualTypeOf<'tab'>();
}

if (fieldIsSidebar(field)) {
  expectTypeOf(field.admin.position).toEqualTypeOf<'sidebar'>();
  expectTypeOf(field.extra).toEqualTypeOf<'preserved'>();
}

if (fieldIsID(field)) {
  expectTypeOf(field.name).toEqualTypeOf<'id'>();
  expectTypeOf(field.extra).toEqualTypeOf<'preserved'>();
}

expectTypeOf(fieldIsHiddenOrDisabled(field)).toEqualTypeOf<boolean>();
expectTypeOf(fieldIsLocalized(fieldOrTab)).toEqualTypeOf<boolean>();
expectTypeOf(fieldIsVirtual(fieldOrTab)).toEqualTypeOf<boolean>();
expectTypeOf(
  fieldShouldBeLocalized({ field: fieldOrTab, parentIsLocalized: false }),
).toEqualTypeOf<boolean>();

declare const tab: Tab & { extra: true };

if (tabHasName(tab)) {
  expectTypeOf(tab).toMatchTypeOf<NamedTab>();
  expectTypeOf(tab.name).toEqualTypeOf<string>();
  expectTypeOf(tab.extra).toEqualTypeOf<true>();
}

declare const group: GroupField & { extra: true };

if (groupHasName(group)) {
  expectTypeOf(group).toMatchTypeOf<NamedGroupField>();
  expectTypeOf(group.name).toEqualTypeOf<string>();
  expectTypeOf(group.extra).toEqualTypeOf<true>();
}

declare const option: Option;
declare const options: Option[];

if (optionIsObject(option)) {
  expectTypeOf(option).toEqualTypeOf<OptionObject>();
  expectTypeOf(option.value).toEqualTypeOf<string>();
}

if (optionIsValue(option)) {
  expectTypeOf(option).toEqualTypeOf<string>();
}

if (optionsAreObjects(options)) {
  expectTypeOf(options).toEqualTypeOf<OptionObject[]>();
}

declare const relationValue: unknown;

if (valueIsValueWithRelation(relationValue)) {
  expectTypeOf(relationValue).toEqualTypeOf<ValueWithRelation>();
}

import type {
  CollapsibleField,
  Field,
  NamedTab,
  RowField,
  Tab,
  TabsField,
  TextField,
  UIField,
  UnnamedTab,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

export const title: TextField = {
  name: 'title',
  type: 'text',
};

export const row: RowField = {
  admin: {
    className: 'name-row',
    condition: (data) => Boolean(data.showName),
    width: '100%',
  },
  custom: { owner: 'content' },
  fields: [title],
  hidden: false,
  type: 'row',
};

export const collapsible: CollapsibleField = {
  admin: {
    description: 'Rarely changed settings',
    initCollapsed: true,
  },
  custom: { owner: 'content' },
  fields: [title],
  hidden: false,
  label: 'Advanced',
  type: 'collapsible',
};

export const collapsibleWithLabelComponent: CollapsibleField = {
  admin: {
    components: {
      Label: '/components/AdvancedLabel',
    },
  },
  fields: [title],
  type: 'collapsible',
};

export const unnamedTab: UnnamedTab = {
  admin: {
    condition: (data) => Boolean(data.showContent),
    description: 'Main content',
  },
  custom: { owner: 'content' },
  description: 'Main content',
  fields: [title],
  id: 'content',
  label: 'Content',
};

export const namedTab: NamedTab = {
  access: {
    read: ({ req }) => Boolean(req.frogbot),
  },
  admin: {
    description: 'Search settings',
  },
  custom: { owner: 'seo' },
  defaultValue: ({ req }) => (req.frogbot ? {} : undefined),
  description: 'Search settings',
  disableDuplicate: true,
  fields: [title],
  hidden: false,
  hooks: {
    afterChange: [({ value }) => value],
    beforeChange: [({ req, value }) => (req.frogbot ? value : undefined)],
  },
  id: 'seo',
  interfaceName: 'SEO',
  label: 'SEO',
  localized: true,
  name: 'seo',
  saveToJWT: 'seo',
  typescriptSchema: [({ jsonSchema }) => jsonSchema],
  virtual: false,
};

export const tabs: TabsField = {
  admin: {
    className: 'page-tabs',
    condition: (data) => Boolean(data.showTabs),
  },
  custom: { owner: 'content' },
  hidden: false,
  tabs: [unnamedTab, namedTab],
  type: 'tabs',
};

export const ui: UIField = {
  admin: {
    components: {
      Field: '/components/RefundAction',
    },
    position: 'sidebar',
  },
  custom: { owner: 'orders' },
  label: 'Refund',
  name: 'refundAction',
  type: 'ui',
};

export const fields: Field[] = [row, collapsible, collapsibleWithLabelComponent, tabs, ui];

expectTypeOf(fields).toMatchTypeOf<Field[]>();
expectTypeOf([unnamedTab, namedTab]).toMatchTypeOf<Tab[]>();

export const rowWithAccess: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `access`.
  access: { read: () => true },
};

export const rowWithDefaultValue: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `defaultValue`.
  defaultValue: 'value',
};

export const rowWithHooks: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `hooks`.
  hooks: { beforeChange: [] },
};

export const rowWithIndex: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `index`.
  index: true,
};

export const rowWithRequired: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `required`.
  required: true,
};

export const rowWithSaveToJWT: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `saveToJWT`.
  saveToJWT: true,
};

export const rowWithTypescriptSchema: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `typescriptSchema`.
  typescriptSchema: [],
};

export const rowWithUnique: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `unique`.
  unique: true,
};

export const rowWithValidate: RowField = {
  ...row,
  // @ts-expect-error Row fields ignore `validate`.
  validate: () => true,
};

export const collapsibleWithAccess: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `access`.
  access: { read: () => true },
};

export const collapsibleWithDefaultValue: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `defaultValue`.
  defaultValue: 'value',
};

export const collapsibleWithHooks: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `hooks`.
  hooks: { beforeChange: [] },
};

export const collapsibleWithIndex: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `index`.
  index: true,
};

export const collapsibleWithRequired: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `required`.
  required: true,
};

export const collapsibleWithSaveToJWT: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `saveToJWT`.
  saveToJWT: true,
};

export const collapsibleWithTypescriptSchema: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `typescriptSchema`.
  typescriptSchema: [],
};

export const collapsibleWithUnique: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `unique`.
  unique: true,
};

export const collapsibleWithValidate: CollapsibleField = {
  ...collapsible,
  // @ts-expect-error Collapsible fields ignore `validate`.
  validate: () => true,
};

export const tabsWithAccess: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `access`.
  access: { read: () => true },
};

export const tabsWithDefaultValue: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `defaultValue`.
  defaultValue: 'value',
};

export const tabsWithHooks: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `hooks`.
  hooks: { beforeChange: [] },
};

export const tabsWithIndex: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `index`.
  index: true,
};

export const tabsWithLabel: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `label`.
  label: 'Tabs',
};

export const tabsWithRequired: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `required`.
  required: true,
};

export const tabsWithSaveToJWT: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `saveToJWT`.
  saveToJWT: true,
};

export const tabsWithTypescriptSchema: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `typescriptSchema`.
  typescriptSchema: [],
};

export const tabsWithUnique: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `unique`.
  unique: true,
};

export const tabsWithValidate: TabsField = {
  ...tabs,
  // @ts-expect-error Tabs fields ignore `validate`.
  validate: () => true,
};

export const unnamedTabWithAccess: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `access`.
  access: { read: () => true },
};

export const unnamedTabWithDefaultValue: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `defaultValue`.
  defaultValue: {},
};

export const unnamedTabWithHidden: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `hidden`.
  hidden: true,
};

export const unnamedTabWithHooks: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `hooks`.
  hooks: { beforeChange: [] },
};

export const unnamedTabWithIndex: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `index`.
  index: true,
};

export const unnamedTabWithRequired: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `required`.
  required: true,
};

export const unnamedTabWithSaveToJWT: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `saveToJWT`.
  saveToJWT: true,
};

export const unnamedTabWithTypescriptSchema: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `typescriptSchema`.
  typescriptSchema: [],
};

export const unnamedTabWithUnique: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `unique`.
  unique: true,
};

export const unnamedTabWithValidate: UnnamedTab = {
  ...unnamedTab,
  // @ts-expect-error Unnamed tabs ignore `validate`.
  validate: () => true,
};

export const namedTabWithIndex: NamedTab = {
  ...namedTab,
  // @ts-expect-error Named tabs ignore `index`.
  index: true,
};

export const namedTabWithRequired: NamedTab = {
  ...namedTab,
  // @ts-expect-error Named tabs ignore `required`.
  required: true,
};

export const namedTabWithUnique: NamedTab = {
  ...namedTab,
  // @ts-expect-error Named tabs ignore `unique`.
  unique: true,
};

export const namedTabWithValidate: NamedTab = {
  ...namedTab,
  // @ts-expect-error Named tabs ignore `validate`.
  validate: () => true,
};

export const uiWithAccess: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `access`.
  access: { read: () => true },
};

export const uiWithDefaultValue: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `defaultValue`.
  defaultValue: 'value',
};

export const uiWithHidden: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `hidden`.
  hidden: true,
};

export const uiWithHooks: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `hooks`.
  hooks: { beforeChange: [] },
};

export const uiWithIndex: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `index`.
  index: true,
};

export const uiWithRequired: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `required`.
  required: true,
};

export const uiWithSaveToJWT: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `saveToJWT`.
  saveToJWT: true,
};

export const uiWithTypescriptSchema: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `typescriptSchema`.
  typescriptSchema: [],
};

export const uiWithUnique: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `unique`.
  unique: true,
};

export const uiWithValidate: UIField = {
  ...ui,
  // @ts-expect-error UI fields ignore `validate`.
  validate: () => true,
};

export const fieldWithIgnoredKey: Field = {
  ...row,
  // @ts-expect-error Row fields ignore `hooks`.
  hooks: { beforeChange: [] },
};

// @ts-expect-error Unnamed tabs reject named-tab options, even through the Tab union.
export const tabWithNamedOnlyKey: Tab = {
  ...unnamedTab,
  hidden: true,
};

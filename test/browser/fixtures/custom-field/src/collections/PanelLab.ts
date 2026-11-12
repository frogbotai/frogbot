import type { CollectionConfig } from 'frogbot';

const admin = { group: 'Panel lab', useAsTitle: 'title' } as const;

/** No record panel: rows open the edit page, and `?record=` redirects to it. */
export const Notes: CollectionConfig = {
  slug: 'notes',
  admin: { ...admin, panel: false },
  fields: [{ name: 'title', type: 'text', required: true }],
};

/** Drafts autosave, with the panel's actions, beforeFields and afterFields slots, and two tabs. */
export const Journal: CollectionConfig = {
  slug: 'journal',
  admin: {
    ...admin,
    components: {
      panel: {
        actions: ['/components/PanelSlots#PanelAction'],
        afterFields: ['/components/PanelSlots#AfterFields'],
        beforeFields: ['/components/PanelServerSlots#BeforeFields'],
        tabs: [
          { Component: '/components/PanelSlots#HistoryTab', label: 'History' },
          {
            Component: '/components/PanelServerSlots#LinksTab',
            label: ({ t }) => `${t('general:document')} links`,
          },
        ],
      },
    },
  },
  versions: { drafts: { autosave: { interval: 100 } } },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'mood', type: 'text', admin: { position: 'sidebar' } },
  ],
};

/** The panel's header replaced. */
export const Memos: CollectionConfig = {
  slug: 'memos',
  admin: { ...admin, components: { panel: { Header: '/components/PanelSlots#PanelHeader' } } },
  fields: [{ name: 'title', type: 'text', required: true }],
};

/** The whole panel replaced by a server component. */
export const Cards: CollectionConfig = {
  slug: 'cards',
  admin: {
    ...admin,
    components: { panel: { Component: '/components/PanelServerSlots#WholePanel' } },
  },
  fields: [{ name: 'title', type: 'text', required: true }],
};

const tabs = [{ Component: '/components/PanelSlots#HistoryTab', label: 'History' }];

/** Saved from the header, with a required field, a tab, and an action that opens a missing tab. */
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: {
    ...admin,
    components: { panel: { actions: ['/components/PanelSlots#SelectMissingTab'], tabs } },
    panel: { properties: ['status'] },
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'text', required: true },
    { name: 'status', type: 'text' },
  ],
};

/** An auth collection with a tab: Payload renders its email and password block itself. */
export const Members: CollectionConfig = {
  slug: 'members',
  auth: true,
  admin: { ...admin, components: { panel: { tabs } } },
  fields: [{ name: 'title', type: 'text' }],
};

/** An upload collection with a tab: Payload renders its file manager beside the fields. */
export const Files: CollectionConfig = {
  slug: 'files',
  upload: { staticDir: 'files' },
  admin: { ...admin, components: { panel: { tabs } } },
  fields: [{ name: 'title', type: 'text' }],
};

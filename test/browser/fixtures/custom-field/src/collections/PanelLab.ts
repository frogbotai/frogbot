import { activityField } from '@frogbotai/plugin-audit-log';
import type { CollectionConfig } from 'frogbot';

const admin = { group: 'Panel lab', useAsTitle: 'title' } as const;

/** No record panel: rows open the edit page, and `?record=` redirects to it. */
export const Notes: CollectionConfig = {
  slug: 'notes',
  admin: { ...admin, panel: false },
  fields: [{ name: 'title', type: 'text', required: true }],
};

/** Drafts autosave, with the panel's actions, beforeFields and afterFields slots. */
export const Journal: CollectionConfig = {
  slug: 'journal',
  admin: {
    ...admin,
    components: {
      panel: {
        actions: ['/components/PanelSlots#PanelAction'],
        afterFields: ['/components/PanelSlots#AfterFields'],
        beforeFields: ['/components/PanelServerSlots#BeforeFields'],
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

/** Save without autosave, a pinned footer, and a pill tabs field with a required field and activity. */
export const Tickets: CollectionConfig = {
  slug: 'tickets',
  admin: {
    ...admin,
    components: { panel: { footer: ['/components/PanelSlots#PanelFooter'] } },
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'status', type: 'text', admin: { position: 'sidebar' } },
    { name: 'notes', type: 'textarea' },
    {
      type: 'tabs',
      admin: { className: 'fb-pill-tabs' },
      tabs: [
        { label: 'Details', fields: [{ name: 'summary', type: 'text', required: true }] },
        { label: 'Activity', fields: [activityField()] },
      ],
    },
  ],
};

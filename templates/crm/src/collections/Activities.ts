import type { CollectionConfig } from 'frogbot';

export const Activities: CollectionConfig = {
  slug: 'activities',
  admin: {
    icon: 'calendar',
    useAsTitle: 'title',
    views: [
      {
        type: 'list',
        defaultFields: ['title', 'type', 'start', 'end', 'deal', 'owner'],
      },
      {
        type: 'calendar',
        start: 'start',
        end: 'end',
        color: 'type',
        defaultFields: ['type', 'deal'],
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'type',
      type: 'select',
      defaultValue: 'meeting',
      options: [
        { label: 'Call', value: 'call', color: 'blue' },
        { label: 'Meeting', value: 'meeting', color: 'purple' },
        { label: 'Demo', value: 'demo', color: 'green' },
        { label: 'Event', value: 'event', color: 'yellow' },
      ],
    },
    {
      name: 'start',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'end',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'allDay', type: 'checkbox', defaultValue: false },
    { name: 'deal', type: 'relationship', relationTo: 'deals' },
    {
      name: 'contacts',
      type: 'relationship',
      relationTo: 'contacts',
      hasMany: true,
    },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
    { name: 'notes', type: 'richText' },
  ],
};

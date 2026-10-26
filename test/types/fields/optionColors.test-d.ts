import type { Field, Option, OptionColor, RadioField, SelectField } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf<OptionColor>().toEqualTypeOf<
  'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'pink' | 'purple'
>();

const palette: Option[] = [
  { label: 'Gray', value: 'gray', color: 'gray' },
  { label: 'Blue', value: 'blue', color: 'blue' },
  { label: 'Green', value: 'green', color: 'green' },
  { label: 'Yellow', value: 'yellow', color: 'yellow' },
  { label: 'Red', value: 'red', color: 'red' },
  { label: 'Pink', value: 'pink', color: 'pink' },
  { label: 'Purple', value: 'purple', color: 'purple' },
];

export const select: SelectField = {
  name: 'labels',
  type: 'select',
  hasMany: true,
  options: palette,
};

export const radio: RadioField = { name: 'tone', type: 'radio', options: palette };

export const misspelled: SelectField = {
  name: 'status',
  type: 'select',
  options: [
    {
      label: 'Done',
      value: 'done',
      // @ts-expect-error unknown colour names are rejected
      color: 'grene',
    },
  ],
};

export const removed: SelectField = {
  name: 'status',
  type: 'select',
  options: [
    // @ts-expect-error teal is not one of Payload's hues
    { label: 'Teal', value: 'teal', color: 'teal' },
    // @ts-expect-error cyan is not one of Payload's hues
    { label: 'Cyan', value: 'cyan', color: 'cyan' },
    // @ts-expect-error orange is not one of Payload's hues
    { label: 'Orange', value: 'orange', color: 'orange' },
  ],
};

export const wrongCase: RadioField = {
  name: 'status',
  type: 'radio',
  options: [
    {
      label: 'Done',
      value: 'done',
      // @ts-expect-error colour names are lowercase
      color: 'Green',
    },
  ],
};

export const labels: Field[] = [
  {
    name: 'status',
    type: 'select',
    options: [
      { label: 'Todo', value: 'todo', color: 'gray' },
      { label: { en: 'Done', de: 'Erledigt' }, value: 'done', color: 'green' },
      { label: ({ t }) => t('general:cancel'), value: 'cancelled', color: 'red' },
      'archived',
    ],
  },
  { name: 'tone', type: 'radio', options: ['low', 'high'] },
];

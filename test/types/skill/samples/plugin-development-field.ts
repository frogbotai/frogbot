import type { TextField } from 'frogbot';

type NoteStatusOverrides = Partial<
  Omit<Extract<TextField, { hasMany?: false }>, 'hasMany' | 'type'>
>;

export function noteStatusField(overrides: NoteStatusOverrides = {}): TextField {
  return {
    name: 'noteStatus',
    admin: {
      components: {
        Field: '@frogbotai/plugin-notes/client#NoteStatusField',
      },
    },
    ...overrides,
    hasMany: false,
    type: 'text',
  };
}

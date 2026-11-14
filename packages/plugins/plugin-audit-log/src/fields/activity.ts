import type { UIField } from 'frogbot';

/** Where the plugin stores its audit collection slug in the config's `custom`. */
export const auditLogCustomKey = 'plugin-audit-log';

/**
 * A `ui` field that lists the open record's audit entries, newest first, read with the signed-in
 * user's access. Put it anywhere in a collection's `fields`, for example in an Activity tab.
 */
export function activityField(overrides: Partial<Omit<UIField, 'type'>> = {}): UIField {
  return {
    name: 'activity',
    label: 'Activity',
    ...overrides,
    type: 'ui',
    admin: {
      ...overrides.admin,
      components: {
        Field: '@frogbotai/plugin-audit-log/rsc#ActivityField',
        ...overrides.admin?.components,
      },
    },
  };
}

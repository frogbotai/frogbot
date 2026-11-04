import { z } from 'zod';

/** A compact record: Asana always returns `gid`, and `name` when `opt_fields` asks for it. */
export const compact = z.looseObject({
  gid: z.string(),
  resource_type: z.string().optional(),
  name: z.string().nullish(),
});

const person = compact.extend({ email: z.string().nullish() });

export const workspace = compact.extend({ is_organization: z.boolean().optional() });

export const team = compact.extend({
  description: z.string().nullish(),
  permalink_url: z.string().nullish(),
});

export const project = compact.extend({
  archived: z.boolean().optional(),
  notes: z.string().nullish(),
  owner: person.nullish(),
  team: compact.nullish(),
  created_at: z.string().nullish(),
  modified_at: z.string().nullish(),
  permalink_url: z.string().nullish(),
});

export const section = compact.extend({ created_at: z.string().nullish() });

export const user = person;

const customFieldValue = compact.extend({
  type: z.string().nullish(),
  display_value: z.string().nullish(),
});

export const task = compact.extend({
  resource_subtype: z.string().optional(),
  notes: z.string().nullish(),
  completed: z.boolean().optional(),
  completed_at: z.string().nullish(),
  created_at: z.string().nullish(),
  modified_at: z.string().nullish(),
  due_on: z.string().nullish(),
  due_at: z.string().nullish(),
  start_on: z.string().nullish(),
  assignee: person.nullish(),
  parent: compact.nullish(),
  memberships: z
    .array(z.looseObject({ project: compact.optional(), section: compact.nullish() }))
    .optional(),
  custom_fields: z.array(customFieldValue).optional(),
  tags: z.array(compact).optional(),
  permalink_url: z.string().nullish(),
});

export const customFieldSetting = compact.extend({
  is_important: z.boolean().optional(),
  custom_field: customFieldValue.extend({ enum_options: z.array(compact).nullish() }).optional(),
});

export const story = compact.extend({
  resource_subtype: z.string().optional(),
  text: z.string().nullish(),
  created_at: z.string().nullish(),
  created_by: person.nullish(),
});

export const attachment = compact.extend({
  resource_subtype: z.string().optional(),
  host: z.string().nullish(),
  size: z.number().nullish(),
  download_url: z.string().nullish(),
  permanent_url: z.string().nullish(),
  view_url: z.string().nullish(),
  created_at: z.string().nullish(),
  parent: compact.nullish(),
});

const customFieldFields = [
  'name',
  'type',
  'resource_subtype',
  'display_value',
  'number_value',
  'text_value',
  'date_value',
  'enum_value.name',
  'multi_enum_values.name',
  'people_value.name',
];

/** The `opt_fields` each record type is read with: every field the Asana template imports. */
export const fields = {
  workspace: ['name', 'is_organization', 'email_domains'],
  team: ['name', 'description', 'permalink_url'],
  project: [
    'name',
    'archived',
    'color',
    'notes',
    'html_notes',
    'created_at',
    'modified_at',
    'start_on',
    'due_on',
    'owner.name',
    'owner.email',
    'team.name',
    'workspace.name',
    'privacy_setting',
    'permalink_url',
  ],
  section: ['name', 'created_at', 'project.name'],
  user: ['name', 'email'],
  task: [
    'name',
    'resource_subtype',
    'notes',
    'html_notes',
    'completed',
    'completed_at',
    'completed_by.name',
    'created_at',
    'modified_at',
    'start_on',
    'start_at',
    'due_on',
    'due_at',
    'assignee.name',
    'assignee.email',
    'parent.name',
    'memberships.project.name',
    'memberships.section.name',
    ...customFieldFields.map((field) => `custom_fields.${field}`),
    'tags.name',
    'followers.name',
    'num_subtasks',
    'permalink_url',
  ],
  dependency: ['name', 'completed', 'resource_subtype'],
  customFieldSetting: [
    'is_important',
    'project.name',
    ...[
      'name',
      'type',
      'resource_subtype',
      'description',
      'precision',
      'format',
      'enum_options.name',
      'enum_options.color',
      'enum_options.enabled',
    ].map((field) => `custom_field.${field}`),
  ],
  story: [
    'resource_subtype',
    'type',
    'text',
    'html_text',
    'created_at',
    'created_by.name',
    'created_by.email',
    'is_pinned',
    'is_edited',
    'target.name',
  ],
  attachment: [
    'name',
    'resource_subtype',
    'host',
    'size',
    'download_url',
    'permanent_url',
    'view_url',
    'created_at',
    'parent.name',
  ],
} as const;

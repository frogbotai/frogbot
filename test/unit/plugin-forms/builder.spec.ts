import type { CollectionConfig, Field, FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { resolveQuestionMove } from '../../../packages/plugins/plugin-forms/src/builder/move.js';
import {
  buildDefinition,
  fieldRefusal,
  type FormFieldInfo,
  missingRequired,
} from '../../../packages/plugins/plugin-forms/src/definition.js';
import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import {
  checkForm,
  collectFields,
  type FormTarget,
  listQuestionFields,
} from '../../../packages/plugins/plugin-forms/src/questions.js';
import type { FormDocument, FormMode } from '../../../packages/plugins/plugin-forms/src/types.js';

const fields: Field[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'body', type: 'textarea', admin: { description: 'Tell us more' } },
  { name: 'email', type: 'email', label: { en: 'Email', de: 'E-Mail' } },
  { name: 'seats', type: 'number' },
  {
    name: 'plan',
    type: 'select',
    options: ['starter', 'pro'],
    required: true,
    defaultValue: 'pro',
  },
  { name: 'contact', type: 'radio', options: ['email', 'phone'] },
  { name: 'terms', type: 'checkbox' },
  { name: 'startsOn', type: 'date' },
  { name: 'tags', type: 'text', hasMany: true },
  { name: 'owner', type: 'relationship', relationTo: 'users' },
  { name: 'meta', type: 'json' },
  { name: 'secret', type: 'text', hidden: true },
  { name: 'file', type: 'upload', relationTo: 'files' },
  { name: 'avatar', type: 'upload', relationTo: 'avatars' },
  { name: 'locked', type: 'text', access: { create: () => false } },
  { name: 'readOnly', type: 'text', access: { update: () => false } },
] as Field[];

const leads: FormTarget = { slug: 'leads', fields: collectFields(fields) };
const files: FormTarget = { slug: 'files', fields: collectFields([]), upload: true };
const targets = new Map([
  ['leads', leads],
  ['files', files],
]);

const req = {
  user: { id: 1, collection: 'users' },
  context: {},
  i18n: { language: 'de' },
} as unknown as FrogBotRequest;

describe('listQuestionFields', () => {
  it('lists each field with its label, type, required state and refusals', async () => {
    const list = await listQuestionFields({ target: leads, targets, req });
    const byName = Object.fromEntries(list.map((info) => [info.name, info]));

    expect(byName.title).toEqual({
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      hasDefault: false,
    });

    expect(byName.email).toMatchObject({ label: 'E-Mail', type: 'email' });
    expect(byName.body).toMatchObject({ description: 'Tell us more' });
    expect(byName.plan).toMatchObject({ required: true, hasDefault: true, defaultValue: 'pro' });
    expect(byName.meta).toEqual({
      name: 'meta',
      label: 'Meta',
      type: 'json',
      required: false,
      hasDefault: false,
      refusal: "has type json, which forms can't ask for",
    });

    expect(byName.locked).toMatchObject({
      createRefusal: "can't be filled from a form: its create access denies form submissions",
    });

    expect(byName.readOnly).toMatchObject({
      editRefusal:
        "can't be changed through an edit link: its read or update access denies form links",
    });

    expect(byName.file).toMatchObject({
      editRefusal: "is a file question, which edit links can't change yet",
    });

    expect(byName.file).not.toHaveProperty('createRefusal');
    expect(byName.avatar).toMatchObject({
      createRefusal: expect.stringContaining("stores files in avatars, which isn't"),
    });
  });

  it.each<FormMode>(['create', 'update', 'both'])(
    'matches what saving accepts and refuses, field by field, in the %s mode',
    async (mode) => {
      const list = await listQuestionFields({ target: leads, targets, req });

      for (const info of list) {
        const required = missingRequired(list, new Set([info.name]), mode).map(({ name }) => name);
        const errors = await checkForm({
          form: {
            slug: 'f',
            collection: 'leads',
            mode,
            steps: [{ questions: [info.name, ...required].map((field) => ({ field })) }],
          },
          targets,
          req,
        });

        const reason = fieldRefusal(info, mode);

        expect(errors, info.name).toEqual(
          reason
            ? [{ path: 'steps.0.questions.0.field', message: `"${info.name}" ${reason}.` }]
            : [],
        );
      }
    },
  );
});

describe('missingRequired', () => {
  const list: FormFieldInfo[] = [
    { name: 'email', label: 'Email', type: 'email', required: true, hasDefault: false },
    { name: 'plan', label: 'Plan', type: 'select', required: true, hasDefault: true },
    { name: 'note', label: 'Note', type: 'text', required: false, hasDefault: false },
  ];

  it('names required fields with no default that the form leaves out', () => {
    expect(missingRequired(list, new Set(), 'create').map(({ name }) => name)).toEqual(['email']);
    expect(missingRequired(list, new Set(['email']), 'both')).toEqual([]);
  });

  it('asks nothing of an editing form', () => {
    expect(missingRequired(list, new Set(), 'update')).toEqual([]);
  });
});

describe('buildDefinition from a field list', () => {
  const list: FormFieldInfo[] = [
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      hasDefault: false,
      placeholder: 'you@example.com',
    },
    {
      name: 'plan',
      label: 'Plan',
      type: 'select',
      required: false,
      hasDefault: true,
      defaultValue: 'pro',
      options: [{ label: 'Pro', value: 'pro' }],
    },
    {
      name: 'meta',
      label: 'Meta',
      type: 'json',
      required: false,
      hasDefault: false,
      refusal: "has type json, which forms can't ask for",
    },
  ];

  it('renders usable questions with their overrides and drops refused ones', () => {
    const form = {
      id: 1,
      title: 'Join',
      slug: 'join',
      collection: 'leads',
      steps: [
        {
          title: 'You',
          questions: [{ field: 'email', label: 'Work email' }, { field: 'meta' }],
        },
        { questions: [{ field: 'plan', description: 'Pick one' }] },
      ],
    } satisfies FormDocument;

    expect(buildDefinition({ form, fields: list, closed: false }).steps).toEqual([
      {
        title: 'You',
        questions: [
          {
            key: 'email',
            type: 'email',
            label: 'Work email',
            placeholder: 'you@example.com',
            required: true,
          },
        ],
      },
      {
        questions: [
          {
            key: 'plan',
            type: 'select',
            label: 'Plan',
            description: 'Pick one',
            required: false,
            options: [{ label: 'Pro', value: 'pro' }],
            defaultValue: 'pro',
          },
        ],
      },
    ]);
  });

  it('reads unsaved admin data, where an empty array is a row count', () => {
    const form = {
      steps: [{ questions: [{}] }, { questions: 0 }],
      hiddenParams: 0,
    } as unknown as FormDocument;

    const definition = buildDefinition({ form, fields: list, closed: false });

    expect(definition.steps).toEqual([{ questions: [] }, { questions: [] }]);
    expect(definition.hiddenParams).toEqual([]);
  });
});

describe('resolveQuestionMove', () => {
  const counts = [2, 1];

  it('moves within a step', () => {
    expect(resolveQuestionMove(counts, 1, 2)).toEqual({
      fromStep: 0,
      fromIndex: 0,
      toStep: 0,
      toIndex: 1,
    });
  });

  it('moves across steps', () => {
    expect(resolveQuestionMove(counts, 2, 4)).toEqual({
      fromStep: 0,
      fromIndex: 1,
      toStep: 1,
      toIndex: 1,
    });

    expect(resolveQuestionMove(counts, 4, 1)).toEqual({
      fromStep: 1,
      fromIndex: 0,
      toStep: 0,
      toIndex: 0,
    });
  });

  it('opens the next step when dropped on its header moving down', () => {
    expect(resolveQuestionMove(counts, 1, 3)).toEqual({
      fromStep: 0,
      fromIndex: 0,
      toStep: 1,
      toIndex: 0,
    });
  });

  it('ends the step before when dropped on a header moving up', () => {
    expect(resolveQuestionMove(counts, 4, 3)).toEqual({
      fromStep: 1,
      fromIndex: 0,
      toStep: 0,
      toIndex: 2,
    });
  });

  it('moves into an empty step', () => {
    expect(resolveQuestionMove([1, 0], 1, 2)).toEqual({
      fromStep: 0,
      fromIndex: 0,
      toStep: 1,
      toIndex: 0,
    });
  });

  it('ignores headers, unknown indices and drops that change nothing', () => {
    expect(resolveQuestionMove(counts, 0, 2)).toBeUndefined();
    expect(resolveQuestionMove(counts, 1, 1)).toBeUndefined();
    expect(resolveQuestionMove(counts, 1, 9)).toBeUndefined();
    expect(resolveQuestionMove(counts, 1, 0)).toBeUndefined();
  });
});

describe('the forms Live Preview', () => {
  async function livePreview(admin?: string) {
    const result = await formsPlugin({ collections: ['leads'] })({
      secret: 'test',
      db: {},
      collections: [{ slug: 'leads', fields: [{ name: 'email', type: 'email' }] }],
      ...(admin ? { routes: { admin } } : {}),
    } as unknown as FrogBotConfig);

    const forms = result.collections?.find(({ slug }) => slug === 'forms') as CollectionConfig;

    return forms.admin?.livePreview;
  }

  it('opens the preview page by default, with a Phone size', async () => {
    expect(await livePreview()).toEqual({
      url: '/forms-preview',
      openByDefault: true,
      breakpoints: [{ name: 'phone', label: 'Phone', width: 390, height: 844 }],
    });
  });

  it('puts the preview page under the admin route', async () => {
    expect((await livePreview('/admin'))?.url).toBe('/admin/forms-preview');
  });
});

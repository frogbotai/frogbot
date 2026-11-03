import type { Field, FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { buildDefinition } from '../../../packages/plugins/plugin-forms/src/definition.js';
import {
  checkForm,
  collectFields,
  type FormTarget,
} from '../../../packages/plugins/plugin-forms/src/questions.js';
import type { FormDocument } from '../../../packages/plugins/plugin-forms/src/types.js';

const fields: Field[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'body', type: 'textarea', admin: { placeholder: 'Tell us more' } },
  { name: 'email', type: 'email' },
  { name: 'seats', type: 'number', label: 'Seats wanted' },
  {
    name: 'plan',
    type: 'select',
    options: [{ label: { en: 'Starter', de: 'Einstieg' }, value: 'starter' }, 'pro'],
    defaultValue: 'starter',
  },
  { name: 'topics', type: 'select', hasMany: true, options: ['a', 'b'] },
  { name: 'contact', type: 'radio', options: ['email', 'phone'] },
  { name: 'terms', type: 'checkbox', required: true, defaultValue: false },
  { name: 'startsOn', type: 'date' },
  { name: 'tags', type: 'text', hasMany: true },
  { name: 'owner', type: 'relationship', relationTo: 'users' },
  { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text' }] },
  { name: 'address', type: 'group', fields: [{ name: 'city', type: 'text' }] },
  { name: 'secret', type: 'text', hidden: true },
  { name: 'computed', type: 'text', virtual: true },
  { name: 'note', type: 'ui', admin: { components: { Field: './Note#Note' } } },
  { type: 'row', fields: [{ name: 'firstName', type: 'text' }] },
  { type: 'collapsible', label: 'More', fields: [{ name: 'company', type: 'text' }] },
  {
    type: 'tabs',
    tabs: [
      { label: 'Main', fields: [{ name: 'phone', type: 'text' }] },
      { name: 'settings', fields: [{ name: 'theme', type: 'text' }] },
    ],
  },
  { name: 'locked', type: 'text', access: { create: () => false } },
  { name: 'staffOnly', type: 'text', access: { create: ({ req }) => Boolean(req.user) } },
] as Field[];

const catalog = collectFields(fields);
const targets = new Map<string, FormTarget>([['leads', { slug: 'leads', fields: catalog }]]);
const req = { user: { id: 1, collection: 'users' }, context: {} } as unknown as FrogBotRequest;

function form(questions: string[], extra: Partial<FormDocument> = {}): Partial<FormDocument> {
  return {
    slug: 'contact',
    collection: 'leads',
    steps: [{ questions: questions.map((field) => ({ field })) }],
    ...extra,
  };
}

describe('collectFields', () => {
  it('allows the question types, through rows, collapsibles and unnamed tabs', () => {
    const allowed = [...catalog.values()].flatMap((entry) =>
      'field' in entry ? [entry.name] : [],
    );

    expect(allowed).toEqual([
      'title',
      'body',
      'email',
      'seats',
      'plan',
      'topics',
      'contact',
      'terms',
      'startsOn',
      'firstName',
      'company',
      'phone',
      'locked',
      'staffOnly',
    ]);
  });

  it('refuses every other data field with a reason', () => {
    const refused = Object.fromEntries(
      [...catalog.values()].flatMap((entry) =>
        'reason' in entry ? [[entry.name, entry.reason]] : [],
      ),
    );

    expect(refused).toEqual({
      tags: "holds a list, which forms can't ask for",
      owner: "has type relationship, which forms can't ask for",
      items: "has type array, which forms can't ask for",
      address: "has type group, which forms can't ask for",
      secret: 'is hidden',
      computed: 'is virtual',
      settings: "is a named tab, which forms can't ask for",
    });

    expect(catalog.has('note')).toBe(false);
    expect(catalog.has('city')).toBe(false);
    expect(catalog.has('theme')).toBe(false);
  });

  it('marks required fields without a default', () => {
    const required = [...catalog.values()]
      .filter((entry) => entry.required)
      .map(({ name }) => name);

    expect(required).toEqual(['title']);
  });
});

describe('checkForm', () => {
  it('accepts a form that asks for every required field', async () => {
    expect(
      await checkForm({
        form: form(['title', 'plan', 'phone'], {
          hiddenParams: [{ name: 'ref', field: 'company' }],
        }),
        targets,
        req,
      }),
    ).toEqual([]);
  });

  it('names each refused question', async () => {
    const errors = await checkForm({
      form: form(['title', 'owner', 'title', 'missing', 'locked', 'staffOnly']),
      targets,
      req,
    });

    expect(errors.map(({ path }) => path)).toEqual([
      'steps.0.questions.1.field',
      'steps.0.questions.2.field',
      'steps.0.questions.3.field',
      'steps.0.questions.4.field',
      'steps.0.questions.5.field',
    ]);

    expect(errors[0].message).toContain('relationship');
    expect(errors[1].message).toContain('already on this form');
    expect(errors[2].message).toContain("isn't a top-level field of leads");
    expect(errors[3].message).toContain('create access denies form submissions');
    expect(errors[4].message).toContain('create access denies form submissions');
  });

  it('refuses an omitted required field without a default', async () => {
    expect(await checkForm({ form: form(['email']), targets, req })).toEqual([
      { path: 'steps', message: expect.stringContaining('"title" is required by leads') },
    ]);
  });

  it('skips the question checks for a closed form, so it can always be closed', async () => {
    expect(await checkForm({ form: form(['owner'], { status: 'closed' }), targets, req })).toEqual(
      [],
    );
  });

  it('refuses parameters into non-text fields and repeated names', async () => {
    const errors = await checkForm({
      form: form(['title'], {
        hiddenParams: [
          { name: 'ref', field: 'seats' },
          { name: 'ref', field: 'company' },
          { name: 'again', field: 'title' },
        ],
      }),
      targets,
      req,
    });

    expect(errors.map(({ path }) => path)).toEqual([
      'hiddenParams.0.field',
      'hiddenParams.1.name',
      'hiddenParams.2.field',
    ]);
  });

  it('refuses unlisted targets, bad slugs and unsafe redirects', async () => {
    const unsafe = ['javascript:alert(1)', '//evil.example', 'evil.example'];

    for (const redirect of unsafe) {
      const errors = await checkForm({
        form: form(['title'], { confirmation: { type: 'redirect', redirect } }),
        targets,
        req,
      });

      expect(errors.map(({ path }) => path)).toEqual(['confirmation.redirect']);
    }

    expect(
      await checkForm({
        form: form(['title'], { confirmation: { type: 'redirect', redirect: '/thanks' } }),
        targets,
        req,
      }),
    ).toEqual([]);

    expect(
      (await checkForm({ form: form(['title'], { slug: 'Not OK' }), targets, req })).map(
        ({ path }) => path,
      ),
    ).toEqual(['slug']);

    expect(
      (await checkForm({ form: form(['title'], { collection: 'users' }), targets, req })).map(
        ({ path }) => path,
      ),
    ).toEqual(['collection']);
  });
});

describe('buildDefinition', () => {
  const saved: FormDocument = {
    id: 1,
    title: 'Sign up',
    slug: 'sign-up',
    collection: 'leads',
    steps: [
      {
        title: 'About you',
        questions: [
          { field: 'title', label: 'Your name', description: 'As on your ID' },
          { field: 'body' },
          { field: 'seats' },
        ],
      },
      {
        questions: [
          { field: 'plan' },
          { field: 'topics' },
          { field: 'contact' },
          { field: 'firstName' },
        ],
      },
    ],
    hiddenParams: [{ name: 'utm_source', field: 'company' }],
    confirmation: { type: 'redirect', redirect: '/thanks' },
  };

  it('builds steps and questions from the form and its fields', () => {
    expect(
      buildDefinition({ form: saved, fields: catalog, closed: false, language: 'de' }),
    ).toEqual({
      slug: 'sign-up',
      title: 'Sign up',
      steps: [
        {
          title: 'About you',
          questions: [
            {
              key: 'title',
              type: 'text',
              label: 'Your name',
              description: 'As on your ID',
              required: true,
            },
            {
              key: 'body',
              type: 'textarea',
              label: 'Body',
              placeholder: 'Tell us more',
              required: false,
            },
            { key: 'seats', type: 'number', label: 'Seats wanted', required: false },
          ],
        },
        {
          questions: [
            {
              key: 'plan',
              type: 'select',
              label: 'Plan',
              required: false,
              options: [
                { label: 'Einstieg', value: 'starter' },
                { label: 'pro', value: 'pro' },
              ],
              defaultValue: 'starter',
            },
            {
              key: 'topics',
              type: 'select',
              label: 'Topics',
              required: false,
              options: [
                { label: 'a', value: 'a' },
                { label: 'b', value: 'b' },
              ],
              hasMany: true,
            },
            {
              key: 'contact',
              type: 'radio',
              label: 'Contact',
              required: false,
              options: [
                { label: 'email', value: 'email' },
                { label: 'phone', value: 'phone' },
              ],
            },
            { key: 'firstName', type: 'text', label: 'First Name', required: false },
          ],
        },
      ],
      hiddenParams: ['utm_source'],
      confirmation: { type: 'redirect', url: '/thanks' },
      closed: false,
    });
  });

  it('skips questions whose field is no longer usable and defaults the confirmation', () => {
    const definition = buildDefinition({
      form: {
        ...saved,
        steps: [{ questions: [{ field: 'owner' }, { field: 'gone' }] }],
        confirmation: null,
      },
      fields: catalog,
      closed: true,
    });

    expect(definition.steps).toEqual([{ questions: [] }]);
    expect(definition.confirmation).toEqual({
      type: 'message',
      message: 'Thanks, your response has been sent.',
    });

    expect(definition.closed).toBe(true);
  });
});

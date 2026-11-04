import type { AccessArgs, CollectionConfig, FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import {
  createFormLinkContext,
  createFormSubmission,
  formLinkFor,
  isFormSubmission,
  wrapCreateAccess,
  wrapLinkAccess,
} from '../../../packages/plugins/plugin-forms/src/access.js';
import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import type { FormDocument } from '../../../packages/plugins/plugin-forms/src/types.js';

const form = { id: 1, title: 'Contact', slug: 'contact', collection: 'leads' } as FormDocument;

function request(context: Record<string, unknown> = {}, user: unknown = null): FrogBotRequest {
  return {
    user,
    context,
    frogbot: {
      config: { _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) } },
    },
  } as unknown as FrogBotRequest;
}

function args(req: FrogBotRequest) {
  return { req } as AccessArgs;
}

function config(collections: CollectionConfig[]): FrogBotConfig {
  return { secret: 'test', db: {}, collections } as unknown as FrogBotConfig;
}

describe('isFormSubmission', () => {
  it('is true only for flags the plugin made, for the named collection', () => {
    const flag = createFormSubmission(form, 'leads');

    expect(isFormSubmission(request({ form: flag }))).toBe(true);
    expect(isFormSubmission(request({ form: flag }), 'leads')).toBe(true);
    expect(isFormSubmission(request({ form: flag }), 'tickets')).toBe(false);
    expect(isFormSubmission(request({ form: { form, collection: 'leads' } }))).toBe(false);
    expect(isFormSubmission(request())).toBe(false);
  });
});

describe('wrapCreateAccess', () => {
  it('admits the collection’s submissions, then defers to its rule', async () => {
    const create = wrapCreateAccess('leads', ({ req }) =>
      req.user ? { owner: { exists: true } } : false,
    );

    const flag = createFormSubmission(form, 'leads');

    expect(await create(args(request({ form: flag })))).toBe(true);
    expect(await create(args(request({ form: createFormSubmission(form, 'tickets') })))).toBe(
      false,
    );
    expect(await create(args(request()))).toBe(false);
    expect(await create(args(request({}, { id: 1 })))).toEqual({ owner: { exists: true } });
  });

  it('keeps the admin-users default when the collection has no rule', async () => {
    const create = wrapCreateAccess('leads', undefined);

    expect(await create(args(request()))).toBe(false);
    expect(await create(args(request({}, { id: 1, collection: 'customers' })))).toBe(false);
    expect(await create(args(request({}, { id: 1, collection: 'users' })))).toBe(true);
    expect(await create(args(request({ form: createFormSubmission(form, 'leads') })))).toBe(true);
  });
});

describe('wrapLinkAccess', () => {
  const link = createFormLinkContext({ id: 7, collection: 'leads', record: 42 });

  it("admits only the link's record, for its collection, and only for flags the plugin made", async () => {
    const read = wrapLinkAccess('leads', ({ req }) => Boolean(req.user));

    expect(await read(args(request({ formLink: link })))).toEqual({ id: { equals: 42 } });
    expect(await read(args(request({ formLink: { ...link } })))).toBe(false);
    expect(await read(args(request()))).toBe(false);
    expect(await read(args(request({}, { id: 1 })))).toBe(true);
    expect(await wrapLinkAccess('tickets', () => false)(args(request({ formLink: link })))).toBe(
      false,
    );
    expect(formLinkFor(request({ formLink: link }), 'tickets')).toBeUndefined();
  });

  it('keeps the admin-users default when the collection has no rule', async () => {
    const update = wrapLinkAccess('leads', undefined);

    expect(await update(args(request({}, { id: 1, collection: 'customers' })))).toBe(false);
    expect(await update(args(request({}, { id: 1, collection: 'users' })))).toBe(true);
  });
});

describe('formsPlugin', () => {
  const leads: CollectionConfig = {
    slug: 'leads',
    access: { read: () => true, create: () => false },
    fields: [{ name: 'email', type: 'email', required: true }],
  };

  const posts: CollectionConfig = { slug: 'posts', fields: [{ name: 'title', type: 'text' }] };

  it('wraps only listed collections and adds the forms and form-links collections', async () => {
    const result = await formsPlugin({ collections: ['leads'] })(config([leads, posts]));
    const wrapped = result.collections.find(({ slug }) => slug === 'leads');
    const forms = result.collections.find(({ slug }) => slug === 'forms');

    expect(result.collections.find(({ slug }) => slug === 'posts')).toBe(posts);
    expect(wrapped?.access?.create).not.toBe(leads.access?.create);
    expect(await wrapped?.access?.read?.(args(request()))).toBe(true);
    expect(
      await wrapped?.access?.update?.(
        args(
          request({ formLink: createFormLinkContext({ id: 1, collection: 'leads', record: 5 }) }),
        ),
      ),
    ).toEqual({ id: { equals: 5 } });

    expect(
      await wrapped?.access?.create?.(args(request({ form: createFormSubmission(form, 'leads') }))),
    ).toBe(true);

    expect(await wrapped?.access?.create?.(args(request()))).toBe(false);
    expect(forms?.endpoints?.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'get /:slug/definition',
      'post /:slug/submit',
    ]);
    expect(
      result.collections
        .find(({ slug }) => slug === 'form-links')
        ?.endpoints?.map(({ method, path }) => `${method} ${path}`),
    ).toEqual(['post /']);
  });

  it('defaults forms access to public reads and signed-in writes, and merges overrides', async () => {
    const result = await formsPlugin({
      collections: ['leads'],
      access: { read: ({ req }) => Boolean(req.user) },
    })(config([leads]));

    const access = result.collections.find(({ slug }) => slug === 'forms')?.access;

    expect(await access?.read?.(args(request()))).toBe(false);
    expect(await access?.create?.(args(request()))).toBe(false);
    expect(await access?.create?.(args(request({}, { id: 1 })))).toBe(true);

    const defaults = (
      await formsPlugin({ collections: ['leads'] })(config([leads]))
    ).collections.find(({ slug }) => slug === 'forms')?.access;

    expect(await defaults?.read?.(args(request()))).toBe(true);
  });

  it('fails for unknown or missing collections and a taken forms slug', () => {
    expect(() => formsPlugin({ collections: ['nope'] })(config([leads]))).toThrow(
      "[plugin-forms] Unknown collection 'nope'",
    );

    expect(() => formsPlugin({ collections: [] })(config([leads]))).toThrow(
      'at least one collection',
    );

    expect(() =>
      formsPlugin({ collections: ['leads'] })(config([leads, { slug: 'forms', fields: [] }])),
    ).toThrow("Collection slug 'forms' already exists");
  });
});

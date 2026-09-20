import { describe, expect, it, vi } from 'vitest';

import { slugField } from '../../../../../packages/frogbot/src/fields/baseFields/slug/index.js';

function getFields(field = slugField()) {
  const checkbox = field.fields[0];
  const text = field.fields[1];

  if (!('hooks' in checkbox) || !('custom' in text)) {
    throw new Error('Unexpected slug field shape');
  }

  return { checkbox, text };
}

function getHook(field = slugField()) {
  const { text } = getFields(field);
  const hook = text.hooks?.beforeValidate?.[0];

  if (!hook) {
    throw new Error('Missing slug generation hook');
  }

  return hook;
}

function request(countVersions = vi.fn().mockResolvedValue({ totalDocs: 0 })) {
  return {
    frogbot: { countVersions },
    context: {},
    user: { id: 'user-1' },
  } as never;
}

describe('slugField', () => {
  it('preserves upstream defaults and admin configuration', () => {
    const field = slugField();
    const { checkbox, text } = getFields(field);

    expect(field).toMatchObject({ type: 'row', admin: { position: 'sidebar' } });
    expect(checkbox).toMatchObject({ name: 'generateSlug', defaultValue: true });
    expect(text).toMatchObject({
      name: 'slug',
      index: true,
      required: true,
      unique: true,
      admin: {
        components: {
          Field: {
            clientProps: { useAsSlug: 'title' },
            path: '@payloadcms/next/client#SlugField',
          },
        },
      },
    });
  });

  it('adapts the base hook before invoking overrides once', () => {
    const replacement = vi.fn();
    const overrides = vi.fn((field) => {
      const checkbox = field.fields[0];

      if ('hooks' in checkbox) {
        expect(checkbox.hooks?.beforeChange).toEqual([]);
        checkbox.hooks = { beforeChange: [replacement] };
      }

      field.fields.push({ type: 'row', fields: [{ name: 'nested', type: 'text' }] });

      return field;
    });

    const field = slugField({ overrides });

    expect(overrides).toHaveBeenCalledOnce();
    expect(field.fields).toHaveLength(3);
    expect(getFields(field).checkbox.hooks?.beforeChange?.[0]).toBe(replacement);
  });

  it('preserves custom names, options, and admin slugify identity', () => {
    const slugify = vi.fn();
    const field = slugField({
      checkboxName: 'regenerate',
      disableUnique: true,
      localized: true,
      name: 'path',
      position: 'sidebar',
      required: false,
      slugify,
      useAsSlug: 'heading',
    });
    const { checkbox, text } = getFields(field);

    expect(checkbox).toMatchObject({ name: 'regenerate', localized: true });
    expect(text).toMatchObject({ name: 'path', localized: true, required: false, unique: false });
    expect((text.custom as { slugify: unknown }).slugify).toBe(slugify);
  });

  it('awaits async slugify and preserves manual values on create', async () => {
    const req = request();
    const slugify = vi.fn(async ({ req: callbackReq, valueToSlugify }) => {
      expect(callbackReq).toBe(req);

      return String(valueToSlugify).toUpperCase();
    });
    const hook = getHook(slugField({ slugify }));
    const generated = { title: 'new post' };

    const siblingData = {};

    const generatedSlug = await hook({
      data: generated,
      operation: 'create',
      req,
      siblingData,
    } as never);

    expect(generated).toEqual({ title: 'new post', slug: 'NEW POST' });
    expect(generatedSlug).toBe('NEW POST');
    expect(siblingData).toEqual({ generateSlug: false });

    const manual = { slug: 'kept', title: 'ignored' };

    await hook({ data: manual, operation: 'create', req, siblingData: {} } as never);

    expect(manual.slug).toBe('KEPT');
  });

  it('retains undefined async slug results', async () => {
    const hook = getHook(slugField({ slugify: async () => undefined }));
    const data = { title: 'new post' };

    const siblingData = {};

    const slug = await hook({
      data,
      operation: 'create',
      req: request(),
      siblingData,
    } as never);

    expect(data).toHaveProperty('slug', undefined);
    expect(slug).toBeUndefined();
    expect(siblingData).toEqual({ generateSlug: true });
  });

  it('generates ordinary updates only while enabled', async () => {
    const hook = getHook();
    const req = request();
    const collection = { slug: 'posts' };
    const enabled = { slug: 'old', title: 'New Title' };

    const enabledSiblingData = { generateSlug: true };

    const slug = await hook({
      collection,
      data: enabled,
      operation: 'update',
      req,
      siblingData: enabledSiblingData,
    } as never);

    expect(enabled.slug).toBe('new-title');
    expect(slug).toBe('new-title');
    expect(enabledSiblingData.generateSlug).toBe(false);

    const disabled = { slug: 'kept', title: 'Ignored' };

    const disabledSiblingData = { generateSlug: false };

    const locked = await hook({
      collection,
      data: disabled,
      operation: 'update',
      req,
      siblingData: disabledSiblingData,
      value: 'kept',
    } as never);

    expect(disabled.slug).toBe('kept');
    expect(locked).toBe('kept');
  });

  it('propagates rejected slugify results', async () => {
    const error = new Error('slug failed');
    const hook = getHook(slugField({ slugify: async () => Promise.reject(error) }));

    await expect(
      hook({ data: { title: 'new post' }, operation: 'create', req: request() } as never),
    ).rejects.toBe(error);
  });

  it('preserves update locking and autosave version thresholds', async () => {
    const countVersions = vi.fn().mockResolvedValue({ totalDocs: 2 });
    const req = request(countVersions);
    const hook = getHook(
      slugField({ slugify: async ({ valueToSlugify }) => `x-${valueToSlugify}` }),
    );
    const collection = { slug: 'posts', versions: { drafts: { autosave: true } } };
    const data = { slug: 'old', title: 'changed' };

    const siblingData = { generateSlug: true };

    const slug = await hook({
      collection,
      data,
      operation: 'update',
      originalDoc: { id: 'post-1', slug: 'old' },
      req,
      siblingData,
    } as never);

    expect(data.slug).toBe('x-changed');
    expect(slug).toBe('x-changed');
    expect(siblingData.generateSlug).toBe(true);
    expect(countVersions).toHaveBeenCalledExactlyOnceWith({
      collection: 'posts',
      where: { parent: { equals: 'post-1' } },
    });

    const manual = { slug: 'manual', title: 'changed again' };

    const manualSiblingData = { generateSlug: true };

    const locked = await hook({
      collection,
      data: manual,
      operation: 'update',
      originalDoc: { id: 'post-1', slug: 'old' },
      req,
      siblingData: manualSiblingData,
    } as never);

    expect(manual.slug).toBe('manual');
    expect(locked).toBe('manual');
    expect(manualSiblingData.generateSlug).toBe(false);
  });

  it('disables autosave generation after the version threshold', async () => {
    const countVersions = vi.fn().mockResolvedValue({ totalDocs: 3 });
    const req = request(countVersions);
    const hook = getHook();
    const siblingData = { generateSlug: true };
    const data = { slug: 'old', title: 'changed' };

    const slug = await hook({
      collection: { slug: 'posts', versions: { drafts: { autosave: true } } },
      data,
      operation: 'update',
      originalDoc: { id: 'post-1', slug: 'old' },
      req,
      siblingData,
    } as never);

    expect(slug).toBe('changed');
    expect(siblingData.generateSlug).toBe(false);
    expect(countVersions).toHaveBeenCalledExactlyOnceWith({
      collection: 'posts',
      where: { parent: { equals: 'post-1' } },
    });
  });
});

import { ValidationError } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import type { ModelId } from '../../../../packages/frogbot/src/ai/types.js';
import type { FieldHookArgs } from '../../../../packages/frogbot/src/fields/config/types.js';
import {
  embedFrom,
  type EmbedFromOptions,
  getEmbedFromOptions,
} from '../../../../packages/frogbot/src/search/embedFrom.js';

const model = 'openai/text-embedding-3-small' as ModelId;

const vector = [0.1, 0.2, 0.3];

const stored = [9, 9, 9];

type Doc = Record<string, unknown>;

type Save = {
  data?: Doc;
  locale?: string;
  operation?: 'create' | 'update';
  overrideAccess?: boolean;
  previous?: Doc;
  published?: Doc;
  sent?: Doc;
};

function run(options: Omit<EmbedFromOptions, 'model'>, save: Save = {}) {
  const embed = vi.fn((_opts: unknown) => Promise.resolve({ embedding: vector }));
  const findByID = vi.fn((_opts: unknown) => Promise.resolve(save.published ?? null));
  const req = { frogbot: { embed, findByID }, locale: save.locale };
  const previous = save.previous ?? {};
  const sent = save.sent ?? {};
  const hook = embedFrom({ model, ...options } as EmbedFromOptions);

  const args = {
    collection: { slug: 'posts' },
    data: save.data ?? sent,
    operation: save.operation ?? 'update',
    originalDoc: { id: 1, ...previous },
    overrideAccess: save.overrideAccess,
    path: ['embedding'],
    previousSiblingDoc: previous,
    previousValue: previous.embedding,
    req,
    siblingData: sent,
    value: sent.embedding,
  } as unknown as FieldHookArgs;

  return { embed, findByID, req, result: hook(args) };
}

const fields = { fields: ['title', 'body'] };

describe('embedFrom options', () => {
  it.each([
    ['no model', { fields: ['title'] }, 'model must be a non-empty string'],
    ['an empty model', { model: ' ', fields: ['title'] }, 'model must be a non-empty string'],
    ['neither source', { model }, 'set exactly one of `fields` or `text`'],
    ['both sources', { model, fields: ['title'], text: () => '' }, 'set exactly one of'],
    ['empty fields', { model, fields: [] }, 'fields must be a non-empty array of field names'],
    ['a blank field name', { model, fields: ['title', ''] }, 'fields must be a non-empty array'],
    ['a text that is not a function', { model, text: 'title' }, 'text must be a function'],
  ])('rejects %s', (_label, options, message) => {
    expect(() => embedFrom(options as unknown as EmbedFromOptions)).toThrow(message);
  });

  it('records the options of each hook it returns', () => {
    const options: EmbedFromOptions = { model, fields: ['title'] };
    const hook = embedFrom(options);

    expect(getEmbedFromOptions(hook)).toBe(options);
    expect(getEmbedFromOptions(() => undefined)).toBeUndefined();
  });
});

describe('embedFrom text', () => {
  it('joins the trimmed, non-empty field values in the listed order with a blank line', async () => {
    const { embed, result } = run(
      { fields: ['body', 'title', 'missing', 'count', 'summary'] },
      {
        operation: 'create',
        sent: { title: '  Title  ', body: '\nBody\n', summary: '   ', count: 3 },
      },
    );

    await expect(result).resolves.toEqual(vector);
    expect(embed.mock.calls[0]?.[0]).toMatchObject({ value: 'Body\n\nTitle' });
  });

  it('passes the merged sibling data to `text` and trims what it returns', async () => {
    const text = vi.fn((doc: Doc) => ` ${String(doc.title)} / ${String(doc.body)} `);
    const { embed, result } = run(
      { text },
      { previous: { title: 'Old', body: 'Kept', embedding: stored }, sent: { title: 'New' } },
    );

    await expect(result).resolves.toEqual(vector);
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ title: 'New', body: 'Kept' }));
    expect(embed.mock.calls[0]?.[0]).toMatchObject({ value: 'New / Kept' });
  });
});

describe('embedFrom change rule', () => {
  it('embeds on create', async () => {
    const { embed, result } = run(fields, { operation: 'create', sent: { title: 'A' } });

    await expect(result).resolves.toEqual(vector);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('stores null without a call when the text is empty', async () => {
    const { embed, result } = run(fields, {
      previous: { title: 'A', embedding: stored },
      sent: { title: '  ' },
    });

    await expect(result).resolves.toBeNull();
    expect(embed).not.toHaveBeenCalled();
  });

  it('keeps the stored vector without a call when the text is unchanged', async () => {
    const { embed, result } = run(fields, {
      previous: { title: 'A', body: 'B', embedding: stored },
      sent: { body: ' B ', other: 'changed' },
    });

    await expect(result).resolves.toBeUndefined();
    expect(embed).not.toHaveBeenCalled();
  });

  it('re-embeds when the text changes', async () => {
    const { embed, result } = run(fields, {
      previous: { title: 'A', body: 'B', embedding: stored },
      sent: { title: 'A2' },
    });

    await expect(result).resolves.toEqual(vector);
    expect(embed.mock.calls[0]?.[0]).toMatchObject({ value: 'A2\n\nB' });
  });

  it('fills a missing stored vector even when the text is unchanged', async () => {
    const { embed, result } = run(fields, {
      previous: { title: 'A', embedding: null },
      sent: { other: 'x' },
    });

    await expect(result).resolves.toEqual(vector);
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe('embedFrom caller vectors', () => {
  it('keeps a vector the caller sends without a call', async () => {
    const { embed, result } = run(fields, {
      previous: { title: 'A', embedding: stored },
      sent: { title: 'B', embedding: [1, 2, 3] },
    });

    await expect(result).resolves.toBeUndefined();
    expect(embed).not.toHaveBeenCalled();
  });

  it('keeps a vector sent on create', async () => {
    const { embed, result } = run(fields, {
      operation: 'create',
      sent: { title: 'A', embedding: [1, 2, 3] },
    });

    await expect(result).resolves.toBeUndefined();
    expect(embed).not.toHaveBeenCalled();
  });

  it('does not count a resend of the stored vector as a caller vector', async () => {
    const { embed, result } = run(fields, {
      previous: { title: 'A', embedding: stored },
      sent: { title: 'B', embedding: [...stored] },
    });

    await expect(result).resolves.toEqual(vector);
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe('embedFrom drafts', () => {
  it('makes no call on a draft save', async () => {
    const { embed, result } = run(fields, {
      data: { _status: 'draft', title: 'B' },
      previous: { title: 'A', embedding: stored },
      sent: { title: 'B' },
    });

    await expect(result).resolves.toBeUndefined();
    expect(embed).not.toHaveBeenCalled();
  });

  it('compares a publish with the published record, not the latest draft', async () => {
    const { embed, findByID, result } = run(fields, {
      data: { _status: 'published' },
      published: { id: 1, _status: 'published', title: 'A', embedding: stored },
      previous: { _status: 'draft', title: 'B', embedding: stored },
      sent: { _status: 'published' },
    });

    await expect(result).resolves.toEqual(vector);
    expect(embed.mock.calls[0]?.[0]).toMatchObject({ value: 'B' });
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        id: 1,
        draft: false,
        fallbackLocale: 'none',
        overrideAccess: true,
      }),
    );
  });

  it("reads the published record with a copy of the save's request", async () => {
    const { findByID, req, result } = run(fields, {
      data: { _status: 'published' },
      published: { id: 1, _status: 'published', title: 'B', embedding: stored },
      previous: { _status: 'draft', title: 'B', embedding: stored },
      sent: { _status: 'published' },
    });

    await result;

    const readReq = (findByID.mock.calls[0]?.[0] as { req: unknown }).req;

    expect(readReq).toMatchObject({ frogbot: req.frogbot });
    expect(readReq).not.toBe(req);
  });

  it('keeps the vector when a publish leaves the published text unchanged', async () => {
    const { embed, result } = run(fields, {
      data: { _status: 'published' },
      published: { id: 1, _status: 'published', title: 'B', embedding: stored },
      previous: { _status: 'draft', title: 'B', embedding: stored },
      sent: { _status: 'published' },
    });

    await expect(result).resolves.toBeUndefined();
    expect(embed).not.toHaveBeenCalled();
  });

  it('embeds the first publish of a record that was only ever a draft', async () => {
    const { embed, result } = run(fields, {
      data: { _status: 'published' },
      published: { id: 1, _status: 'draft', title: 'B', embedding: stored },
      previous: { _status: 'draft', title: 'B', embedding: stored },
      sent: { _status: 'published' },
    });

    await expect(result).resolves.toEqual(vector);
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe('embedFrom embed call', () => {
  it.each([true, false, undefined])(
    'passes the model, text, request and the save overrideAccess (%s)',
    async (overrideAccess) => {
      const { embed, req, result } = run(fields, {
        operation: 'create',
        overrideAccess,
        sent: { title: 'A' },
      });

      await result;

      expect(embed).toHaveBeenCalledWith({ model, value: 'A', req, overrideAccess });
    },
  );

  it('lets a failed call fail the save', async () => {
    const hook = embedFrom({ model, fields: ['title'] });
    const error = new Error('provider down');
    const args = {
      collection: { slug: 'posts' },
      data: { title: 'A' },
      operation: 'create',
      path: ['embedding'],
      previousSiblingDoc: {},
      req: { frogbot: { embed: vi.fn().mockRejectedValue(error) } },
      siblingData: { title: 'A' },
    } as unknown as FieldHookArgs;

    await expect(hook(args)).rejects.toBe(error);
  });

  it("refuses a locale 'all' write, naming the field", async () => {
    const { embed, result } = run(fields, { locale: 'all', sent: { title: { en: 'A' } } });

    const error = await result.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).data.errors[0]).toMatchObject({
      path: 'embedding',
      message: expect.stringContaining('Save one locale at a time'),
    });
    expect(embed).not.toHaveBeenCalled();
  });
});

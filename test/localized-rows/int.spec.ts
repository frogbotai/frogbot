import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { draftySlug, plainSlug, strictSlug } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Slug = typeof draftySlug | typeof plainSlug | typeof strictSlug;

type Row = { id: string; blockType?: string; [key: string]: unknown };

type Doc = {
  id: number | string;
  title?: string;
  layout?: Row[];
  items?: Row[];
  sections?: (Row & { content?: Row[] })[];
  hero?: { heading?: string; ctas?: Row[] };
  meta?: { summary?: string; links?: Row[] };
  _status?: string;
};

const block = (id: string, text: string, size: string) => ({
  id,
  blockType: 'intl',
  text,
  size,
});

const item = (id: string, label: string, size: string) => ({ id, label, size });

const enDoc = {
  title: 'Page',
  layout: [block('m1', 'Hello', 's'), block('m2', 'Bye', 'l')],
  items: [item('i1', 'One', 's'), item('i2', 'Two', 'l')],
  sections: [
    { id: 's1', heading: 'First', content: [block('n1', 'Up', 's'), block('n2', 'Down', 'l')] },
  ],
};

const esDoc = {
  title: 'Pagina',
  layout: [block('m1', 'Hola', 's'), block('m2', 'Adios', 'l')],
  items: [item('i1', 'Uno', 's'), item('i2', 'Dos', 'l')],
  sections: [
    {
      id: 's1',
      heading: 'Primero',
      content: [block('n1', 'Arriba', 's'), block('n2', 'Abajo', 'l')],
    },
  ],
};

const reordered = {
  layout: [block('m2', 'Bye', 'l'), block('m1', 'Hello', 's')],
  items: [item('i2', 'Two', 'l'), item('i1', 'One', 's')],
  sections: [
    { id: 's1', heading: 'First', content: [block('n2', 'Down', 'l'), block('n1', 'Up', 's')] },
  ],
};

const pick = (rows: Row[] | undefined, key: string) =>
  (rows ?? []).map((row) => `${row.id} ${String(row[key])}`);

describe('localized values inside reordered rows', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  const create = async (collection: Slug) => {
    const doc = (await booted.frogbot.create({
      collection,
      locale: 'en',
      data: { ...enDoc, _status: 'published' },
    })) as Doc;

    await booted.frogbot.update({
      collection,
      id: doc.id,
      locale: 'es',
      data: { ...esDoc, _status: 'published' },
    });

    return doc.id;
  };

  const read = async (collection: Slug, id: Doc['id'], locale: string, draft = false) =>
    (await booted.frogbot.findByID({
      collection,
      id,
      locale,
      fallbackLocale: 'none',
      depth: 0,
      draft,
    })) as Doc;

  const mainRow = async (collection: Slug, id: Doc['id']) =>
    (await booted.payload.db.findOne({
      collection,
      locale: 'all',
      where: { id: { equals: id } },
    })) as Record<string, unknown> | null;

  describe.each([draftySlug, plainSlug] as const)('%s', (collection) => {
    it('keeps each block, array row and nested block with its own text after a reorder in one locale', async () => {
      const id = await create(collection);

      await booted.frogbot.update({ collection, id, locale: 'en', data: reordered });

      const es = await read(collection, id, 'es');
      const en = await read(collection, id, 'en');

      expect(pick(es.layout, 'text')).toEqual(['m2 Adios', 'm1 Hola']);
      expect(pick(es.items, 'label')).toEqual(['i2 Dos', 'i1 Uno']);
      expect(pick(es.sections?.[0]?.content, 'text')).toEqual(['n2 Abajo', 'n1 Arriba']);
      expect(es.sections?.[0]?.heading).toBe('Primero');
      expect(es.title).toBe('Pagina');
      expect(pick(en.layout, 'text')).toEqual(['m2 Bye', 'm1 Hello']);
      expect(pick(en.items, 'label')).toEqual(['i2 Two', 'i1 One']);
      expect(pick(en.sections?.[0]?.content, 'text')).toEqual(['n2 Down', 'n1 Up']);
      expect(pick(es.layout, 'size')).toEqual(['m2 l', 'm1 s']);
    });

    it('gives an added row no text in the other locale and drops a removed one', async () => {
      const id = await create(collection);

      await booted.frogbot.update({
        collection,
        id,
        locale: 'en',
        data: { layout: [block('m3', 'New', 'm'), block('m2', 'Bye', 'l')] },
      });

      const es = await read(collection, id, 'es');

      expect(es.layout?.map((row) => row.id)).toEqual(['m3', 'm2']);
      expect(es.layout?.[0]?.text ?? null).toBeNull();
      expect(es.layout?.[1]?.text).toBe('Adios');
    });
  });

  it('leaves the version row and every locale status as they were', async () => {
    const id = await create(draftySlug);

    await booted.frogbot.update({ collection: draftySlug, id, locale: 'en', data: reordered });

    const row = await mainRow(draftySlug, id);
    const version = await read(draftySlug, id, 'es', true);

    expect(row?._status).toEqual({ en: 'published', es: 'published' });
    expect(row?.title).toEqual({ en: 'Page', es: 'Pagina' });
    expect(pick(version.layout, 'text')).toEqual(['m2 Adios', 'm1 Hola']);
    expect(pick(version.items, 'label')).toEqual(['i2 Dos', 'i1 Uno']);
    expect(pick(version.sections?.[0]?.content, 'text')).toEqual(['n2 Abajo', 'n1 Arriba']);
  });

  it('keeps the other locale on a row with no text in the saved locale that moves past the old length', async () => {
    const doc = (await booted.frogbot.create({
      collection: draftySlug,
      locale: 'en',
      data: { layout: [{ id: 'm1', blockType: 'intl', size: 's' }], _status: 'published' },
    })) as Doc;

    await booted.frogbot.update({
      collection: draftySlug,
      id: doc.id,
      locale: 'es',
      data: { layout: [block('m1', 'Hola', 's')], _status: 'published' },
    });

    await booted.frogbot.update({
      collection: draftySlug,
      id: doc.id,
      locale: 'en',
      data: { layout: [block('m3', 'New', 'm'), { id: 'm1', blockType: 'intl', size: 's' }] },
    });

    const es = await read(draftySlug, doc.id, 'es');

    expect(es.layout?.map((row) => `${row.id} ${String(row.text ?? null)}`)).toEqual([
      'm3 null',
      'm1 Hola',
    ]);
  });

  it('repairs a publish of a draft reorder that sends only the status', async () => {
    const id = await create(draftySlug);

    await booted.frogbot.update({
      collection: draftySlug,
      id,
      locale: 'en',
      draft: true,
      data: reordered,
    });

    await booted.frogbot.update({
      collection: draftySlug,
      id,
      locale: 'en',
      data: { _status: 'published' },
    });

    expect(pick((await read(draftySlug, id, 'es')).layout, 'text')).toEqual([
      'm2 Adios',
      'm1 Hola',
    ]);
  });

  it('keeps an unpublished locale draft out of the main row', async () => {
    const doc = (await booted.frogbot.create({
      collection: draftySlug,
      locale: 'en',
      data: { ...enDoc, _status: 'published' },
    })) as Doc;

    await booted.frogbot.update({
      collection: draftySlug,
      id: doc.id,
      locale: 'es',
      draft: true,
      data: esDoc,
    });

    await booted.frogbot.update({
      collection: draftySlug,
      id: doc.id,
      locale: 'en',
      data: reordered,
    });

    const es = await read(draftySlug, doc.id, 'es');

    expect(es.layout?.map((row) => row.text ?? null)).toEqual([null, null]);
  });

  it('leaves a draft save and a locale "all" write as Payload makes them', async () => {
    const id = await create(draftySlug);

    await booted.frogbot.update({
      collection: draftySlug,
      id,
      locale: 'en',
      draft: true,
      data: reordered,
    });

    expect(pick((await read(draftySlug, id, 'es')).layout, 'text')).toEqual([
      'm1 Hola',
      'm2 Adios',
    ]);

    await booted.frogbot.update({
      collection: draftySlug,
      id,
      locale: 'all',
      data: {
        layout: [
          { id: 'm2', blockType: 'intl', size: 'l', text: { en: 'Bye', es: 'Chao' } },
          { id: 'm1', blockType: 'intl', size: 's', text: { en: 'Hello', es: 'Hola' } },
        ],
      },
    });

    expect(pick((await read(draftySlug, id, 'es')).layout, 'text')).toEqual(['m2 Chao', 'm1 Hola']);
  });

  it('leaves rows sent without ids as Payload writes them', async () => {
    const id = await create(draftySlug);

    await booted.frogbot.update({
      collection: draftySlug,
      id,
      locale: 'en',
      data: {
        layout: [
          { blockType: 'intl', text: 'Hello', size: 's' },
          { blockType: 'intl', text: 'Bye', size: 'l' },
        ],
      },
    });

    const es = await read(draftySlug, id, 'es');

    expect(es.layout?.map((row) => row.text ?? null)).toEqual(['Hola', 'Adios']);
  });

  it('repairs a publish sent with draft and publishAllLocales, which Payload treats as one locale', async () => {
    const id = await create(draftySlug);

    await booted.frogbot.update({
      collection: draftySlug,
      id,
      locale: 'en',
      draft: true,
      publishAllLocales: true,
      data: { ...reordered, _status: 'published' },
    });

    expect(pick((await read(draftySlug, id, 'es')).layout, 'text')).toEqual([
      'm2 Adios',
      'm1 Hola',
    ]);
  });

  it('keeps the other locale title, group and tab text and statuses after a reorder inside a group and a named tab', async () => {
    const doc = (await booted.frogbot.create({
      collection: draftySlug,
      locale: 'en',
      data: {
        title: 'Page',
        hero: { heading: 'Head', ctas: [item('h1', 'Go', 's'), item('h2', 'Stop', 'l')] },
        meta: {
          summary: 'Sum',
          links: [
            { id: 'k1', text: 'A' },
            { id: 'k2', text: 'B' },
          ],
        },
        _status: 'published',
      },
    })) as Doc;

    await booted.frogbot.update({
      collection: draftySlug,
      id: doc.id,
      locale: 'es',
      data: {
        title: 'Pagina',
        hero: { heading: 'Titular', ctas: [item('h1', 'Ir', 's'), item('h2', 'Parar', 'l')] },
        meta: {
          summary: 'Resumen',
          links: [
            { id: 'k1', text: 'Ae' },
            { id: 'k2', text: 'Be' },
          ],
        },
        _status: 'published',
      },
    });

    const before = await mainRow(draftySlug, doc.id);

    await booted.frogbot.update({
      collection: draftySlug,
      id: doc.id,
      locale: 'en',
      data: {
        hero: { heading: 'Head', ctas: [item('h2', 'Stop', 'l'), item('h1', 'Go', 's')] },
        meta: {
          summary: 'Sum',
          links: [
            { id: 'k2', text: 'B' },
            { id: 'k1', text: 'A' },
          ],
        },
      },
    });

    const row = await mainRow(draftySlug, doc.id);
    const es = await read(draftySlug, doc.id, 'es');

    expect({
      title: es.title,
      heading: es.hero?.heading,
      summary: es.meta?.summary,
      status: row?._status,
    }).toEqual({
      title: 'Pagina',
      heading: 'Titular',
      summary: 'Resumen',
      status: before?._status,
    });
    expect(pick(es.hero?.ctas, 'label')).toEqual(['h2 Parar', 'h1 Ir']);
    expect(pick(es.meta?.links, 'text')).toEqual(['k2 Be', 'k1 Ae']);
  });

  it('leaves no snapshot from a failed publish to revert a later publish of all locales on the same request', async () => {
    const doc = (await booted.frogbot.create({
      collection: strictSlug,
      locale: 'en',
      data: { code: 'x', layout: enDoc.layout, _status: 'published' },
    })) as Doc;

    await booted.frogbot.update({
      collection: strictSlug,
      id: doc.id,
      locale: 'es',
      data: { layout: esDoc.layout, _status: 'published' },
    });

    const req = {} as never;

    await expect(
      booted.frogbot.update({
        collection: strictSlug,
        id: doc.id,
        locale: 'en',
        req,
        data: { code: null, layout: reordered.layout },
      }),
    ).rejects.toThrow();

    await booted.frogbot.update({
      collection: strictSlug,
      id: doc.id,
      locale: 'es',
      draft: true,
      data: { layout: [block('m1', 'Hola2', 's'), block('m2', 'Adios2', 'l')] },
    });

    await booted.frogbot.update({
      collection: strictSlug,
      id: doc.id,
      locale: 'en',
      req,
      publishAllLocales: true,
      data: { _status: 'published' },
    });

    expect(pick((await read(strictSlug, doc.id, 'es')).layout, 'text')).toEqual([
      'm1 Hola2',
      'm2 Adios2',
    ]);
  });
});

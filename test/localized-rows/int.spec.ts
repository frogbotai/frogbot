import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { draftySlug, plainSlug } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Slug = typeof draftySlug | typeof plainSlug;

type Row = { id: string; blockType?: string; [key: string]: unknown };

type Doc = {
  id: number | string;
  title?: string;
  layout?: Row[];
  items?: Row[];
  sections?: (Row & { content?: Row[] })[];
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
});

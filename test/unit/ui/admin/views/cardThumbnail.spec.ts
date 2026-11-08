import type { SanitizedCollectionConfig } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  getCardThumbnailPopulate,
  getCardThumbnailURL,
  resolveCardThumbnail,
} from '../../../../../packages/ui/src/admin/views/cards/thumbnail.js';

const config = (value: object) => value as SanitizedCollectionConfig;

const media = config({
  slug: 'media',
  admin: {},
  fields: [],
  flattenedFields: [{ name: 'alt', type: 'text' }],
  upload: {},
});

const companies = config({
  slug: 'companies',
  admin: { useAsThumbnail: 'logo' },
  fields: [],
  flattenedFields: [
    { name: 'name', type: 'text' },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'banner', type: 'upload', relationTo: 'media' },
  ],
});

const logo = { id: 1, mimeType: 'image/webp', url: '/api/media/file/logo.webp', width: 256 };
const banner = { id: 2, mimeType: 'image/png', url: '/api/media/file/banner.png', width: 1200 };

describe('card thumbnails', () => {
  it("uses the view's field over the collection's", () => {
    const thumbnail = resolveCardThumbnail({
      collectionConfig: companies,
      view: { useAsThumbnail: 'banner' },
    });

    expect(thumbnail).toEqual({ field: 'banner', fit: 'cover' });
    expect(getCardThumbnailURL({ banner, id: 'a', logo }, thumbnail)).toBe(banner.url);
  });

  it('turns images off with false', () => {
    const thumbnail = resolveCardThumbnail({
      collectionConfig: companies,
      view: { thumbnailFit: 'contain', useAsThumbnail: false },
    });

    expect(thumbnail).toBe(false);
    expect(getCardThumbnailURL({ id: 'a', logo }, thumbnail)).toBeUndefined();
    expect(
      getCardThumbnailPopulate({ collectionConfig: companies, collections: [media], thumbnail }),
    ).toBeUndefined();
  });

  it("falls back to the collection's useAsThumbnail and keeps the view's fit", () => {
    const thumbnail = resolveCardThumbnail({
      collectionConfig: companies,
      view: { thumbnailFit: 'contain' },
    });

    expect(thumbnail).toEqual({ field: 'logo', fit: 'contain' });
    expect(getCardThumbnailURL({ id: 'a', logo }, thumbnail)).toBe(logo.url);
  });

  it("shows an upload collection's own file with nothing set", () => {
    const thumbnail = resolveCardThumbnail({ collectionConfig: media, view: {} });

    expect(thumbnail).toEqual({ fit: 'cover' });
    expect(getCardThumbnailURL({ id: 1, ...logo }, thumbnail)).toBe(logo.url);
    expect(
      getCardThumbnailPopulate({ collectionConfig: media, collections: [media], thumbnail }),
    ).toBeUndefined();
  });

  it('has no image when the field is empty or not loaded', () => {
    const thumbnail = resolveCardThumbnail({ collectionConfig: companies, view: {} });

    expect(getCardThumbnailURL({ id: 'a', logo: null }, thumbnail)).toBeUndefined();
    expect(getCardThumbnailURL({ id: 'a', logo: 1 }, thumbnail)).toBeUndefined();
    expect(getCardThumbnailURL({ id: 'a' }, thumbnail)).toBeUndefined();
  });

  it('never draws a non-upload record from its own url and mimeType fields', () => {
    const links = config({
      slug: 'links',
      admin: {},
      fields: [],
      flattenedFields: [
        { name: 'url', type: 'text' },
        { name: 'mimeType', type: 'text' },
      ],
    });

    const record = { id: 'l', mimeType: 'image/svg+xml', url: 'https://tracker.example/pixel.svg' };

    expect(
      getCardThumbnailURL(record, resolveCardThumbnail({ collectionConfig: links, view: {} })),
    ).toBeUndefined();
    expect(
      getCardThumbnailURL(
        { ...record, logo: null },
        resolveCardThumbnail({ collectionConfig: companies, view: {} }),
      ),
    ).toBeUndefined();
  });

  it("falls back to an upload record's own file when the view's field is empty, as Payload does", () => {
    const videos = config({
      slug: 'videos',
      admin: {},
      fields: [],
      flattenedFields: [{ name: 'poster', type: 'upload', relationTo: 'media' }],
      upload: {},
    });

    const thumbnail = resolveCardThumbnail({
      collectionConfig: videos,
      view: { useAsThumbnail: 'poster' },
    });

    const own = { id: 7, mimeType: 'image/png', url: '/api/videos/file/a.png', width: 800 };

    expect(getCardThumbnailURL({ ...own, poster: null }, thumbnail)).toBe(own.url);
    expect(getCardThumbnailURL({ ...own, poster: banner }, thumbnail)).toBe(banner.url);
  });

  it("populates the resolved field's upload with Payload's thumbnail select", () => {
    const populate = getCardThumbnailPopulate({
      collectionConfig: companies,
      collections: [media],
      thumbnail: { field: 'banner', fit: 'cover' },
    });

    expect(populate).toEqual({ media: expect.objectContaining({ url: true }) });
    expect(companies.admin.useAsThumbnail).toBe('logo');
  });
});

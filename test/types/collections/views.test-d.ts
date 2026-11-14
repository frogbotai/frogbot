import type { CollectionConfig, CollectionView, GalleryView, TimelineView } from 'frogbot';

export const companies: CollectionConfig = {
  slug: 'companies',
  admin: {
    useAsThumbnail: 'logo',
    views: [
      { type: 'gallery', label: 'Logos', thumbnailFit: 'contain' },
      { type: 'board', groupBy: 'lifecycle', useAsThumbnail: false },
    ],
  },
  fields: [
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'lifecycle', type: 'select', options: ['lead'] },
  ],
};

export const gallery: GalleryView = {
  type: 'gallery',
  useAsThumbnail: 'photo',
  thumbnailFit: 'cover',
  defaultFields: ['industry', 'owner'],
  components: {
    afterCards: ['/After#After'],
    beforeCards: ['/Before#Before'],
    Card: '/CompanyCard#CompanyCard',
    NoResults: '/Empty#Empty',
  },
};

// @ts-expect-error The board's card image is useAsThumbnail; cover is gone.
export const boardCover: CollectionView = { type: 'board', cover: 'photo' };

// @ts-expect-error true is not a field name; leave useAsThumbnail unset for the collection's.
export const thumbnailTrue: CollectionView = { type: 'gallery', useAsThumbnail: true };

// @ts-expect-error thumbnailFit is 'cover' or 'contain'.
export const thumbnailFill: CollectionView = { type: 'gallery', thumbnailFit: 'fill' };

// @ts-expect-error Lists draw no cards.
export const listThumbnail: CollectionView = { type: 'list', useAsThumbnail: 'photo' };

// @ts-expect-error Lists draw no cards.
export const listFit: CollectionView = { type: 'list', thumbnailFit: 'contain' };

export const calendarThumbnail: CollectionView = {
  type: 'calendar',
  start: 'due',
  // @ts-expect-error Calendars draw no cards.
  useAsThumbnail: 'photo',
};

export const calendarFit: CollectionView = {
  type: 'calendar',
  start: 'due',
  // @ts-expect-error Calendars draw no cards.
  thumbnailFit: 'contain',
};

export const galleryColumns: CollectionView = {
  type: 'gallery',
  // @ts-expect-error A gallery has no columns.
  components: { beforeColumns: [] },
};

export const timeline: TimelineView = {
  type: 'timeline',
  slug: 'timeline',
  start: 'startDate',
  end: 'dueDate',
  groupBy: 'project',
  color: 'status',
  scales: ['week', 'month', 'day'],
  components: {
    afterTimeline: ['/After#After'],
    beforeTimeline: ['/Before#Before'],
    Bar: '/TaskBar#TaskBar',
  },
};

// @ts-expect-error A timeline needs a start date field.
export const timelineNoStart: CollectionView = { type: 'timeline', end: 'dueDate' };

export const timelineQuarter: CollectionView = {
  type: 'timeline',
  start: 'startDate',
  // @ts-expect-error Scales are day, week and month.
  scales: ['quarter'],
};

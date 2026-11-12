import { renderListView } from '@payloadcms/ui/views/List';
import type { CollectionView } from 'frogbot';
import type { AdminViewServerProps, ListViewServerProps } from 'payload';
import type { ReactNode } from 'react';

import { BoardView } from '../Board/index.js';
import { CalendarView } from '../Calendar/index.js';
import { withPageProps } from '../collectionViews.js';
import { CustomCollectionView } from '../CustomCollectionView.js';
import { GalleryView } from '../Gallery/index.js';
import { TimelineView } from '../Timeline/index.js';

const FIRST_VIEWS: Record<
  Exclude<CollectionView['type'], 'list'>,
  (props: AdminViewServerProps) => Promise<ReactNode>
> = {
  board: BoardView,
  calendar: CalendarView,
  custom: CustomCollectionView,
  gallery: GalleryView,
  timeline: TimelineView,
};

/** Whether the route is the collection's own root, `/collections/<slug>`. */
export function isCollectionRoot(params: ListViewServerProps['params']): boolean {
  const segments = (params as { segments?: unknown } | undefined)?.segments;

  return Array.isArray(segments) && segments.length === 2;
}

/**
 * Whether Payload renders the list in a relationship drawer. It does so through a server function
 * with the collection root's params, so only the server action header tells it from the page.
 */
export async function isDrawer(props: ListViewServerProps): Promise<boolean> {
  return isCollectionRoot(props.params) && (await props.server.getHeaders()).has('next-action');
}

/** The first view, rendered at the collection root with the list's server props. */
export async function renderFirstView(
  type: Exclude<CollectionView['type'], 'list'>,
  props: ListViewServerProps,
): Promise<ReactNode> {
  return FIRST_VIEWS[type](await withPageProps(props));
}

/**
 * A list that isn't the first view has its own route, which Payload gives no list data. Renders it
 * through Payload's list renderer, as Payload's trash route does.
 */
export async function renderListRoute(props: AdminViewServerProps): Promise<ReactNode> {
  try {
    const { List } = await renderListView({
      ...props,
      ComponentOverride: '@frogbotai/ui/admin/rsc#ListView',
      enableRowSelections: true,
      viewType: 'list',
    });

    return List;
  } catch (error) {
    if (error instanceof Error && error.message === 'not-found') return props.server.notFound();
    throw error;
  }
}

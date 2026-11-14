import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import { renderDocumentHandler } from '@payloadcms/ui/views/Document/handleServerFunction';
import { canAccessAdmin, type Data, type PayloadComponent, type ServerFunction } from 'payload';
import { isReactServerComponentOrFunction } from 'payload/shared';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import { getPanelComponents } from './config.js';
import { PanelBridge, PanelClientSlot, PanelFooter } from './PanelSlots.client.js';
import { RecordPanelHeader } from './RecordPanelHeader.client.js';
import { RecordPanelProperties } from './RecordPanelProperties.client.js';
import { RecordPanelBodyTitle, RecordPanelTitle } from './RecordPanelTitle.client.js';

/** The FrogBot server function that renders the record side panel. */
export const RENDER_RECORD_PANEL = 'frogbot-render-record-panel';

export type RenderRecordPanelArgs = {
  collectionSlug: string;
  id?: number | string;
  initialData?: Data;
};

export type RenderRecordPanelResult =
  { notFound: true } | { data: Data; notFound?: false; Panel: ReactNode };

type Slot = PayloadComponent | PayloadComponent[] | undefined;

/**
 * Renders the record panel: Payload's own edit view from `renderDocument`, with the panel's
 * header, title, properties and slots placed inside its form through `BeforeFields` and
 * `AfterFields`, so they read Payload's form and document state. The `footer` slot renders there
 * too, and is portalled under the scrolling body. A missing or unreadable record comes back as
 * `notFound`.
 */
export const renderRecordPanelHandler: ServerFunction<
  RenderRecordPanelArgs,
  Promise<RenderRecordPanelResult>
> = async (args) => {
  const { collectionSlug, id, importMap, initialData, permissions, req } = args;
  const collection = req.payload.collections[collectionSlug]?.config;

  if (!collection || !req.user) return { notFound: true };

  await canAccessAdmin({ req });

  if (id !== undefined) {
    const doc = await req.payload
      .findByID({
        id,
        collection: collectionSlug,
        depth: 0,
        disableErrors: true,
        overrideAccess: false,
        req,
        trash: false,
      })
      .catch(() => null);

    if (!doc) return { notFound: true };
  }

  const components = getPanelComponents(collection);
  const clientProps = { collectionSlug, id: id ?? '' };

  const render = (Component: Slot, key?: string): ReactNode => {
    if (!Component) return null;
    if (Array.isArray(Component)) {
      return Component.map((item, index) => render(item, `${key ?? 'slot'}-${index}`));
    }

    const node = RenderServerComponent({ clientProps, Component, importMap, key, serverProps });
    const type = isValidElement(node) ? node.type : undefined;

    return typeof type === 'function' && !isReactServerComponentOrFunction(type) ? (
      <PanelClientSlot key={key}>{node}</PanelClientSlot>
    ) : (
      node
    );
  };

  let serverProps: Record<string, unknown> = {
    i18n: req.i18n,
    id,
    payload: req.payload,
    permissions,
    req,
    user: req.user,
  };

  if (components.Component) {
    const doc =
      id === undefined
        ? (initialData ?? {})
        : await req.payload.findByID({
            id,
            collection: collectionSlug,
            depth: 0,
            overrideAccess: false,
            req,
          });

    serverProps = { ...serverProps, doc };

    return { data: doc, Panel: render(components.Component, 'panel') };
  }

  const { data, Document } = await renderDocumentHandler({
    ...args,
    collectionSlug,
    docID: id as number | string,
    drawerSlug: 'fb-record-panel',
    initialData,
    redirectAfterCreate: false,
    redirectAfterDelete: false,
    redirectAfterDuplicate: false,
    redirectAfterRestore: false,
  });

  serverProps = { ...serverProps, doc: data };

  const BeforeFields = (
    <>
      <PanelBridge />
      {components.Header ? (
        render(components.Header, 'header')
      ) : (
        <RecordPanelHeader actions={render(components.actions, 'action')} />
      )}
      {components.Header ? <RecordPanelTitle /> : <RecordPanelBodyTitle />}
      {render(components.beforeFields, 'before')}
      <RecordPanelProperties />
    </>
  );

  const AfterFields = (
    <>
      {components.afterFields ? (
        <div className="fb-record-panel__after-fields">
          {render(components.afterFields, 'after')}
        </div>
      ) : null}
      {components.footer ? <PanelFooter>{render(components.footer, 'footer')}</PanelFooter> : null}
    </>
  );

  return {
    data,
    Panel: isValidElement(Document)
      ? cloneElement(Document as ReactElement<Record<string, unknown>>, {
          AfterFields,
          BeforeFields,
        })
      : Document,
  };
};

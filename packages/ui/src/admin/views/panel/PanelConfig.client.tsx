'use client';

import { ConfigProvider, useConfig } from '@payloadcms/ui';
import type { ClientCollectionConfig, ClientConfig, ClientField } from 'payload';
import { createContext, type ReactNode, use, useMemo } from 'react';

import {
  findPanelField,
  getPanelSettings,
  omitPanelFields,
  resolvePropertyPaths,
  resolveTitlePath,
} from './config.js';

type PanelLayout = {
  collectionConfig: ClientCollectionConfig;
  properties: Array<{ field: ClientField; parentPath: string; path: string }>;
  titlePath?: string;
};

const PanelLayoutContext = createContext<PanelLayout | undefined>(undefined);

/** The panel's title field and property list, with the collection's own field configs. */
export function usePanelLayout(): PanelLayout | undefined {
  return use(PanelLayoutContext);
}

/**
 * Gives the panel's edit form a client config without the title and property fields, so
 * Payload's form renders every other field in config order and none twice. The title and the
 * property list render them from the original configs.
 */
export function PanelConfig({
  children,
  collectionSlug,
}: {
  children: ReactNode;
  collectionSlug: string;
}) {
  const { config, getEntityConfig } = useConfig();
  const collectionConfig = getEntityConfig({ collectionSlug });

  const { layout, panelConfig } = useMemo(() => {
    const settings = getPanelSettings(collectionConfig);
    const titlePath = resolveTitlePath(collectionConfig);
    const paths = settings ? resolvePropertyPaths(collectionConfig, settings) : [];
    const properties = paths.flatMap((path) => {
      const found = findPanelField(collectionConfig.fields, path);

      return found && path !== titlePath ? [{ ...found, path }] : [];
    });

    const omitted = new Set([
      ...properties.map(({ path }) => path),
      ...(titlePath ? [titlePath] : []),
    ]);

    const next: ClientConfig = {
      ...config,
      collections: config.collections.map((collection) =>
        collection.slug === collectionSlug
          ? { ...collection, fields: omitPanelFields(collection.fields, omitted) }
          : collection,
      ),
    };

    return { layout: { collectionConfig, properties, titlePath }, panelConfig: next };
  }, [collectionConfig, collectionSlug, config]);

  return (
    <PanelLayoutContext value={layout}>
      <ConfigProvider config={panelConfig}>{children}</ConfigProvider>
    </PanelLayoutContext>
  );
}

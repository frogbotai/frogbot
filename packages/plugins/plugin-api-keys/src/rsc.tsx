import { RenderServerComponent } from '@frogbotai/ui/admin/rsc';

import { ApiKeysManager } from './client/ApiKeysManager.js';

type RenderArgs = Parameters<typeof RenderServerComponent>[0];

type KeysCollectionAdmin = {
  custom?: { 'plugin-api-keys'?: { createFields?: RenderArgs['Component'][] } };
};

export type ApiKeysManagerServerProps = {
  collectionSlug: string;
  i18n?: unknown;
  payload: {
    collections: Record<string, { config: { admin?: KeysCollectionAdmin } } | undefined>;
    importMap: RenderArgs['importMap'];
  };
  req?: unknown;
  user?: unknown;
};

/**
 * Renders the create dialog with the fields other plugins register on the keys collection under
 * `admin.custom['plugin-api-keys'].createFields`. Each one gets the signed-in `user` and `req`.
 */
export function ApiKeysManagerServer({
  collectionSlug,
  i18n,
  payload,
  req,
  user,
}: ApiKeysManagerServerProps) {
  const components =
    payload.collections[collectionSlug]?.config.admin?.custom?.['plugin-api-keys']?.createFields ??
    [];

  const createFields = components.map((Component, index) =>
    RenderServerComponent({
      Component,
      importMap: payload.importMap,
      key: `create-field-${index}`,
      serverProps: { collectionSlug, i18n, payload, req, user },
    }),
  );

  return (
    <ApiKeysManager
      collectionSlug={collectionSlug}
      createFields={createFields.length > 0 ? createFields : undefined}
    />
  );
}

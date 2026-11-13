import type { ImportExportPluginOptions } from '@frogbotai/plugin-import-export';

/** Imports and exports run at once, so a CSV lands as soon as it is saved. */
const importable = [
  'companies',
  'contacts',
  'deals',
  'activities',
  'tasks',
].map((slug) => ({
  slug,
  import: { disableJobsQueue: true },
  export: { disableJobsQueue: true },
}));

function isManager(user: object | null): boolean {
  const roles: unknown = user && 'roles' in user ? user.roles : [];

  return (
    Array.isArray(roles) &&
    roles.some((role) => role === 'admin' || role === 'manager')
  );
}

type CollectionOverride = NonNullable<
  ImportExportPluginOptions['overrideImportCollection']
>;

/** Anyone signed in runs an import or export; only admins and managers delete one. */
export const managedRuns: CollectionOverride = ({ collection }) => ({
  ...collection,
  access: {
    ...collection.access,
    delete: ({ req }) => isManager(req.user),
  },
});

/** CSV and JSON import and export for every record collection. */
export const importExport: ImportExportPluginOptions = {
  collections: importable,
  overrideExportCollection: managedRuns,
  overrideImportCollection: managedRuns,
};

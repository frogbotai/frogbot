import type { RequireDrizzleKit } from '@payloadcms/drizzle';

import type { BuildSearchSchema } from '../../../database/types.js';
import type { AssertSearchPrerequisitesArgs } from './prerequisites.js';
import {
  addSearchSnapshot,
  getSearchMigration,
  splitSearchSnapshot,
} from './schema/getSearchMigration.js';
import { getSearchSchema } from './schema/getSearchSchema.js';
import { type PushResult, pushSearchSchema } from './schema/pushSearchSchema.js';
import type { SearchDatabase, SQLiteSearchAdapter } from './types.js';

type AssertSearchPrerequisites = (args: AssertSearchPrerequisitesArgs) => Promise<void>;

export function createSchemaBuilder({
  assertPrerequisites,
}: {
  assertPrerequisites?: AssertSearchPrerequisites;
} = {}): BuildSearchSchema {
  return ({ collections, db }) => {
    const adapter = db as unknown as SQLiteSearchAdapter;
    const { connect, migrate, requireDrizzleKit } = adapter;
    const checkPrerequisites = async () => assertPrerequisites?.({ adapter, collections });
    const getSchema = () => getSearchSchema({ adapter, collections });

    adapter.requireDrizzleKit = (() => {
      const kit = requireDrizzleKit();

      return {
        ...kit,
        generateDrizzleJson: async (schema) =>
          addSearchSnapshot(await kit.generateDrizzleJson(schema), getSchema()),
        generateMigration: async (previous, next) => {
          const [previousSnapshot, previousSearch] = splitSearchSnapshot(previous);
          const [nextSnapshot, nextSearch] = splitSearchSnapshot(next);

          return getSearchMigration({
            next: nextSearch,
            previous: previousSearch,
            statements: await kit.generateMigration(previousSnapshot, nextSnapshot),
          });
        },
        pushSchema: async (schema, drizzle, ...args) => {
          await checkPrerequisites();

          return pushSearchSchema({
            drizzle: drizzle as unknown as SearchDatabase,
            push: () => kit.pushSchema(schema, drizzle, ...args) as Promise<PushResult>,
            schema: getSchema(),
          });
        },
      };
    }) satisfies RequireDrizzleKit;

    if (assertPrerequisites) {
      adapter.connect = async (options) => {
        await connect?.call(adapter, options);
        await checkPrerequisites();
      };

      adapter.migrate = async (args) => {
        await checkPrerequisites();

        return migrate.call(adapter, args);
      };
    }
  };
}

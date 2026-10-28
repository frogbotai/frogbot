import type { FrogBotConfig } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { importExportPlugin } from '../../../packages/plugins/plugin-import-export/src/index.js';

const config: FrogBotConfig = {
  secret: 'test',
  db: {} as FrogBotConfig['db'],
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
};

function componentPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];

  return Object.values(value).flatMap(componentPaths);
}

describe('importExportPlugin component paths', () => {
  it('maps every Payload component path to the FrogBot re-export', async () => {
    const result = await importExportPlugin({
      collections: [
        {
          slug: 'posts',
          export: {
            overrideCollection: ({ collection }) => ({ ...collection, slug: 'post-exports' }),
          },
        },
      ],
      overrideExportCollection: ({ collection }) => ({ ...collection, slug: 'csv-exports' }),
    })(structuredClone(config));

    const paths = componentPaths(result);

    expect(result.collections.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(['csv-exports', 'post-exports']),
    );
    expect(paths.filter((path) => path.startsWith('@payloadcms/plugin-import-export'))).toEqual([]);
    expect(paths).toContain('@frogbotai/plugin-import-export/rsc#ImportExportProvider');
    expect(paths).toContain('@frogbotai/plugin-import-export/rsc#ExportListMenuItem');
  });
});

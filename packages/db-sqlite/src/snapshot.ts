import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { type Config, createClient } from '@libsql/client';

/**
 * Copies a `file:` database with `VACUUM INTO` on a connection of its own, so it neither waits for
 * nor sees another process's open write, then opens the copy.
 */
export function sqliteSnapshot(config: Config) {
  const client = { ...config, syncUrl: undefined, syncInterval: undefined };

  return async ({ cwd, to }: { cwd: string; to: string }) => {
    const path = databasePath(client.url, cwd);

    if (!(await stat(path).catch(() => undefined))?.isFile()) return undefined;

    const source = createClient({ ...client, url: pathToFileURL(path).href });

    try {
      await source.execute({ sql: 'VACUUM INTO ?', args: [to] });
    } finally {
      source.close();
    }

    const copy = createClient({ ...client, url: pathToFileURL(to).href });

    return {
      source: path,
      all: async (sql: string) => {
        const { columns, rows } = await copy.execute(sql);

        return rows.map((row) =>
          Object.fromEntries(columns.map((column) => [column, row[column] as unknown])),
        );
      },
      run: async (sql: string) => {
        await copy.execute(sql);
      },
      close: () => Promise.resolve(copy.close()),
    };
  };
}

function databasePath(url: string, cwd: string): string {
  const [location = ''] = url.split('?');

  return resolve(cwd, location.startsWith('file://') ? fileURLToPath(location) : location.slice(5));
}

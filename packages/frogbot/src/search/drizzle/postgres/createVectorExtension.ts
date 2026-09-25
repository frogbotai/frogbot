import type { BasePostgresAdapter } from '@payloadcms/drizzle/postgres';
import { sql } from 'drizzle-orm';

import { SearchCapabilityError } from '../../errors.js';
import { getErrorCode } from './getErrorCode.js';

const minimumVersion = [0, 8, 0];

function isSupportedVersion(version: string): boolean {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10) || 0);

  for (const [position, minimum] of minimumVersion.entries()) {
    const part = parts[position] ?? 0;

    if (part !== minimum) return part > minimum;
  }

  return true;
}

function getReason(code: string | undefined) {
  if (code === '42501') return 'permission-denied';

  if (code === '0A000' || code === '58P01') return 'missing-prerequisite';

  return 'setup-failed';
}

async function getInstalledVersion(adapter: BasePostgresAdapter): Promise<string | undefined> {
  const { rows } = await adapter.drizzle.execute<{ version: string }>(
    sql`select extversion as version from pg_extension where extname = 'vector'`,
  );

  return rows[0]?.version;
}

export async function createVectorExtension({
  adapter,
  collection,
  index,
}: {
  adapter: BasePostgresAdapter;
  collection: string;
  index: string;
}): Promise<void> {
  let version = await getInstalledVersion(adapter);

  if (!version) {
    try {
      await adapter.drizzle.execute(sql`create extension if not exists vector`);
    } catch (error) {
      const code = getErrorCode(error);
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      const message = cause instanceof Error ? cause.message : String(cause);

      throw new SearchCapabilityError(
        collection,
        index,
        'vector',
        getReason(code),
        `The pgvector extension could not be created${code ? ` (SQLSTATE ${code})` : ''}: ${message}`,
      );
    }

    version = await getInstalledVersion(adapter);
  }

  if (!version || !isSupportedVersion(version)) {
    throw new SearchCapabilityError(
      collection,
      index,
      'vector',
      'missing-prerequisite',
      `pgvector ${minimumVersion.join('.')} or later is required; found ${version ?? 'none'}.`,
    );
  }
}

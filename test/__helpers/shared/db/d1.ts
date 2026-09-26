import { randomUUID } from 'node:crypto';

import type { SQLiteAdapterArgs } from '@frogbotai/db-d1-sqlite';

import { hasTestTool, requireTestTool } from './requireTestTool.js';

export type D1Binding = SQLiteAdapterArgs['binding'];

export type D1Database = {
  binding: D1Binding;
  dispose: () => Promise<void>;
  name: string;
};

export const hasMiniflare = () => hasTestTool('miniflare');

export async function createD1Database(prefix: string): Promise<D1Database> {
  const { Miniflare } = requireTestTool('miniflare');
  const name = `${prefix}_${randomUUID().replaceAll('-', '')}`;

  const miniflare = new Miniflare({
    compatibilityDate: '2026-08-01',
    d1Databases: { DB: name },
    modules: true,
    script: 'export default { fetch() { return new Response(null) } }',
  });

  try {
    const binding = (await miniflare.getD1Database('DB')) as D1Binding;

    return { binding, dispose: () => miniflare.dispose(), name };
  } catch (error) {
    await miniflare.dispose();

    throw error;
  }
}

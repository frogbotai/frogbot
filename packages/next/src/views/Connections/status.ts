import type { ConnectionItem } from './types.js';

export function connectionStatus(
  connection: ConnectionItem,
  scopes: readonly string[] = [],
): ConnectionItem['status'] | 'expired' | 'relink' {
  if (connection.status !== 'active') return connection.status;
  if (connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now()) return 'expired';
  if (
    connection.method === 'oauth' &&
    scopes.some((scope) => !connection.scopes?.includes(scope))
  ) {
    return 'relink';
  }

  return 'active';
}

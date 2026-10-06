import type { SQLiteAdapter } from '@payloadcms/db-sqlite';

type Client = SQLiteAdapter['client'];
type Method = (...args: unknown[]) => Promise<unknown>;

const methods = ['batch', 'execute', 'executeMultiple', 'migrate', 'transaction'] as const;
const recovering = new WeakSet<Client>();

export function recoverFromBusy(client: Client): void {
  if (client.protocol !== 'file' || recovering.has(client)) return;

  recovering.add(client);

  const target = client as unknown as Record<(typeof methods)[number], Method>;
  const transaction = client.transaction.bind(client);
  let settled: Promise<unknown> = Promise.resolve();

  for (const method of methods) {
    const run = target[method].bind(client);

    target[method] = (...args) => {
      const result = settled.then(() => run(...args));

      settled = result
        .catch(async (error: unknown) => {
          if (isBusy(error)) (await transaction('deferred')).close();
        })
        .catch(() => undefined);

      return result;
    };
  }
}

function isBusy(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_BUSY')
  );
}

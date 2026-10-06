import type { SQLiteAdapter } from '@payloadcms/db-sqlite';

type Client = SQLiteAdapter['client'];
type Transaction = Awaited<ReturnType<Client['transaction']>>;
type Method = (...args: unknown[]) => Promise<unknown>;
type Mode = 'deferred' | 'read' | 'write';

const locked = new WeakSet<Client>();
const commitErrors = new WeakMap<object, Error>();

/**
 * Returns and forgets the error of this transaction's failed commit. Payload's
 * `commitTransaction` swallows commit errors, so the adapter rethrows this one.
 */
export function takeCommitError(transaction: object | undefined): Error | undefined {
  if (!transaction) return undefined;

  const error = commitErrors.get(transaction);

  commitErrors.delete(transaction);

  return error;
}

/**
 * The connection-level pragmas Payload's `connect` sets. libsql opens a fresh connection after
 * each `transaction()`, so they're set again on every one.
 */
export function connectionPragmas({
  busyTimeout,
  wal,
}: Pick<SQLiteAdapter, 'busyTimeout' | 'wal'>): string[] {
  return [
    ...(busyTimeout > 0 ? [`PRAGMA busy_timeout = ${busyTimeout}`] : []),
    ...(wal
      ? [
          `PRAGMA journal_size_limit = ${wal.journalSizeLimit}`,
          `PRAGMA synchronous = ${wal.synchronous}`,
        ]
      : []),
  ];
}

export function installWriteLock({
  client,
  pragmas,
  timeout,
}: {
  client: Client;
  pragmas: string[];
  timeout: number;
}): void {
  if (client.protocol !== 'file' || locked.has(client)) return;

  locked.add(client);

  const target = client as unknown as Record<
    'batch' | 'execute' | 'executeMultiple' | 'migrate',
    Method
  >;
  const execute = target.execute.bind(client);
  const transaction = client.transaction.bind(client);
  const lock = createLock(timeout);

  const replaceConnection = (mode?: Mode) => {
    const begun = transaction(mode);

    for (const pragma of pragmas) execute(pragma).catch(() => undefined);

    return begun;
  };

  const recover = (error: unknown): never => {
    if (isBusy(error)) {
      replaceConnection('deferred').then(
        (stale) => stale.close(),
        () => undefined,
      );
    }

    throw error;
  };

  const run = (method: Method, args: unknown[]) => method(...args).catch(recover);

  for (const name of ['batch', 'executeMultiple', 'migrate'] as const) {
    const method = target[name].bind(client);

    target[name] = (...args) => lock.run(() => run(method, args));
  }

  target.execute = (...args) =>
    isRead(args[0]) ? run(execute, args) : lock.run(() => run(execute, args));

  client.transaction = async (mode?: Mode) => {
    const release = await lock.acquire();
    let begun: Transaction;

    try {
      begun = await replaceConnection(mode);
    } catch (error) {
      release();

      return recover(error);
    }

    const { rollback, close } = begun;

    // libsql's own commit prepares `COMMIT`; when it fails, that statement is never reset and
    // keeps a SHARED lock on the file until garbage collection, so in rollback-journal mode
    // every later commit is busy. `executeMultiple` runs it with `exec`, which leaves nothing open.
    begun.commit = async () => {
      try {
        await begun.executeMultiple('COMMIT');
      } catch (error) {
        commitErrors.set(
          begun,
          error instanceof Error ? error : new Error(String(error), { cause: error }),
        );

        if (!begun.closed) await begun.executeMultiple('ROLLBACK').catch(() => undefined);

        throw error;
      } finally {
        if (begun.closed) release();
      }
    };

    begun.rollback = async () => {
      try {
        if (!begun.closed) await rollback.call(begun);
      } finally {
        release();
      }
    };

    begun.close = () => {
      try {
        close.call(begun);
      } finally {
        release();
      }
    };

    return begun;
  };
}

function createLock(timeout: number) {
  const waiting: Array<() => void> = [];
  let held = false;

  const release = () => {
    const next = waiting.shift();

    if (next) next();
    else held = false;
  };

  const acquire = () =>
    new Promise<() => void>((resolve, reject) => {
      const started = Date.now();
      let released = false;
      let timer: NodeJS.Timeout | undefined;

      const grant = () => {
        clearTimeout(timer);
        held = true;
        resolve(() => {
          if (released) return;

          released = true;
          release();
        });
      };

      if (!held) return grant();

      timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(grant), 1);
        reject(
          new Error(
            `SQLite write waited ${Date.now() - started} ms for the write lock and gave up (\`writeLockTimeout\` is ${timeout} ms). Either a write ran without \`req\` while a transaction was open, so it waited on the transaction it belongs to (pass \`req\` so it joins the transaction), or a long transaction held the lock (shorten it, or raise \`writeLockTimeout\`).`,
          ),
        );
      }, timeout);

      waiting.push(grant);
    });

  return {
    acquire,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const done = await acquire();

      try {
        return await fn();
      } finally {
        done();
      }
    },
  };
}

const readPragmasWithArgument = new Set([
  'foreign_key_check',
  'foreign_key_list',
  'index_info',
  'index_list',
  'index_xinfo',
  'integrity_check',
  'quick_check',
  'table_info',
  'table_list',
  'table_xinfo',
]);
const writePragmas = new Set(['incremental_vacuum', 'optimize', 'wal_checkpoint']);

/**
 * Whether a statement only reads. Anything it can't place is a write, so it takes the lock.
 */
function isRead(statement: unknown): boolean {
  const text =
    typeof statement === 'string' ? statement : (statement as { sql?: unknown } | undefined)?.sql;

  if (typeof text !== 'string') return false;

  const sql = mask(text);

  if (sql === undefined) return false;

  const pragma = /^pragma\s+(?:\w+\s*\.\s*)?(\w+)\s*(\(|=|;|$)/.exec(sql);

  if (pragma) {
    const [, name, next] = pragma;

    if (next === '(') return readPragmasWithArgument.has(name);

    return next !== '=' && !writePragmas.has(name);
  }

  if (/^explain\b/.test(sql)) return true;

  return /^(?:select|values)\b/.test(sql.startsWith('with') ? mainStatement(sql) : sql);
}

/**
 * Lowercases a statement and replaces comments, string literals, and quoted identifiers with
 * a space or a placeholder, so their text can't look like a keyword. Returns `undefined` when
 * a quote or comment is left open.
 */
function mask(text: string): string | undefined {
  let out = '';

  for (let index = 0; index < text.length;) {
    const char = text[index];
    const pair = text.slice(index, index + 2);

    if (pair === '--') {
      const end = text.indexOf('\n', index);

      index = end === -1 ? text.length : end + 1;
      out += ' ';
    } else if (pair === '/*') {
      const end = text.indexOf('*/', index + 2);

      if (end === -1) return undefined;

      index = end + 2;
      out += ' ';
    } else if (char === "'" || char === '"' || char === '`' || char === '[') {
      const close = char === '[' ? ']' : char;
      let end = index + 1;

      for (;;) {
        end = text.indexOf(close, end);

        if (end === -1) return undefined;
        if (close !== ']' && text[end + 1] === close) end += 2;
        else break;
      }

      index = end + 1;
      out += char === "'" ? " '' " : ' _ ';
    } else {
      out += char.toLowerCase();
      index += 1;
    }
  }

  return out.trim();
}

/**
 * Skips the CTEs of a masked `WITH` statement and returns what follows them.
 */
function mainStatement(sql: string): string {
  let rest = sql.replace(/^with\s+(?:recursive\s+)?/, '');

  for (;;) {
    const head = /^\w+\s*(?:\([^()]*\)\s*)?as\s+(?:not\s+)?(?:materialized\s+)?\(/.exec(rest);

    if (!head) return '';

    let depth = 1;
    let index = head[0].length;

    for (; index < rest.length && depth > 0; index += 1) {
      if (rest[index] === '(') depth += 1;
      else if (rest[index] === ')') depth -= 1;
    }

    if (depth > 0) return '';

    rest = rest.slice(index).trimStart();

    if (!rest.startsWith(',')) return rest;

    rest = rest.slice(1).trimStart();
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

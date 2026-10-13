/** The server calls FrogBot's admin makes, matching that part of Payload 4's `ServerAdapter`. */
export type ServerAdapter = {
  notFound: () => never;
  redirect: (path: string) => never;
};

const key: unique symbol = Symbol.for('@frogbotai/ui/server-adapter');

type AdapterGlobal = typeof globalThis & { [key]?: ServerAdapter };

export function setServerAdapter(adapter: ServerAdapter): void {
  (globalThis as AdapterGlobal)[key] = adapter;
}

export function getServerAdapter(): ServerAdapter {
  const adapter = (globalThis as AdapterGlobal)[key];

  if (!adapter) {
    throw new Error(
      '[frogbot] getServerAdapter needs a ServerAdapter. Call setServerAdapter from your framework adapter, as @frogbotai/next does.',
    );
  }

  return adapter;
}

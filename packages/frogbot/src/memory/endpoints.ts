import type { Endpoint } from '../endpoints/types.js';
import type { FrogBotRequest } from '../types/request.js';
import { isMemoryAdapterError, type MemoryErrorCode } from './errors.js';
import { invalid } from './run.js';
import type { FrogBotMemory, MemoryCallArgs } from './types.js';

type MemoryInput = Record<string, unknown>;

type MemoryOperation = (args: {
  memory: FrogBotMemory;
  input: MemoryInput;
  call: MemoryCallArgs;
}) => Promise<unknown>;

const statuses: Record<MemoryErrorCode, number> = {
  invalid: 400,
  limit: 409,
  'not-found': 404,
  unavailable: 503,
};

const memoryPath = '/frogbot/memory';

const scopeKeys = ['scope', 'agent'];

const writeKeys = [...scopeKeys, 'text', 'key', 'pinned'];

function readQuery(req: FrogBotRequest, keys: string[]): MemoryInput {
  const params = new URL(req.url!).searchParams;
  const input: MemoryInput = {};

  for (const [name, value] of params) {
    if (!keys.includes(name)) throw invalid(`Memory does not support the '${name}' parameter.`);

    input[name] = name === 'limit' || name === 'page' ? Number(value) : value;
  }

  if (input.pinned !== undefined) {
    input.pinned = input.pinned === 'true' ? true : input.pinned === 'false' ? false : input.pinned;
  }

  return input;
}

async function readBody(req: FrogBotRequest, keys: string[]): Promise<MemoryInput> {
  const body: unknown = await req.json?.().catch(() => undefined);

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('Memory requires a JSON object request body.');
  }

  for (const name of Object.keys(body)) {
    if (!keys.includes(name)) throw invalid(`Memory does not support the '${name}' option.`);
  }

  return body as MemoryInput;
}

function endpoint({
  method,
  path,
  read,
  run,
}: {
  method: 'delete' | 'get' | 'patch' | 'post';
  path: string;
  read: (req: FrogBotRequest) => MemoryInput | Promise<MemoryInput>;
  run: MemoryOperation;
}): Endpoint {
  return {
    method,
    path: `${memoryPath}${path}`,
    handler: async (req) => {
      try {
        const { agent, scope, ...input } = await read(req);
        const id = req.routeParams?.id;

        const call = {
          scope,
          ...(agent !== undefined ? { agent } : {}),
          req,
          overrideAccess: false,
        } as MemoryCallArgs;

        return Response.json(
          await run({
            memory: req.frogbot.memory,
            input: id === undefined ? input : { ...input, id },
            call,
          }),
        );
      } catch (error) {
        if (!isMemoryAdapterError(error)) throw error;

        return Response.json(
          { errors: [{ message: error.message }] },
          { status: statuses[error.code] },
        );
      }
    },
  };
}

/** REST for `frogbot.memory`. Every call checks access as the signed-in person. */
export function buildMemoryEndpoints(): Endpoint[] {
  return [
    endpoint({
      method: 'get',
      path: '',
      read: (req) => readQuery(req, [...scopeKeys, 'pinned', 'limit', 'page']),
      run: ({ call, input, memory }) => memory.list({ ...call, ...input }),
    }),
    endpoint({
      method: 'delete',
      path: '',
      read: (req) => readQuery(req, scopeKeys),
      run: ({ call, memory }) => memory.forget(call),
    }),
    endpoint({
      method: 'post',
      path: '',
      read: (req) => readBody(req, writeKeys),
      run: ({ call, input, memory }) =>
        memory.save({ ...call, ...input, text: input.text as string }),
    }),
    endpoint({
      method: 'get',
      path: '/search',
      read: (req) => readQuery(req, [...scopeKeys, 'query', 'limit']),
      run: ({ call, input, memory }) =>
        memory.search({ ...call, ...input, query: input.query as string }),
    }),
    endpoint({
      method: 'get',
      path: '/:id',
      read: (req) => readQuery(req, scopeKeys),
      run: ({ call, input, memory }) => memory.get({ ...call, id: input.id as string }),
    }),
    endpoint({
      method: 'patch',
      path: '/:id',
      read: (req) => readBody(req, writeKeys),
      run: ({ call, input, memory }) =>
        memory.update({ ...call, ...input, id: input.id as string }),
    }),
    endpoint({
      method: 'delete',
      path: '/:id',
      read: (req) => readQuery(req, scopeKeys),
      run: ({ call, input, memory }) => memory.forget({ ...call, id: input.id as string }),
    }),
  ];
}

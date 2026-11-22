import type { Payload, PayloadRequest, Where } from 'payload';

import { toPayloadRequest } from '../../seams/request.js';
import { MemoryAdapterError } from '../errors.js';
import type { Memory, MemoryTarget } from '../types.js';
import { MEMORIES_SLUG } from './collection.js';

export type MemoryDoc = {
  id: number | string;
  scope: string;
  key?: string | null;
  slot: string;
  text: string;
  pinned?: boolean | null;
  createdAt: string;
  updatedAt: string;
};

type FindArgs = {
  target: MemoryTarget;
  where?: Where;
  limit?: number;
  page?: number;
  sort?: string;
  pagination?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks a stored memories row. */
export function toMemoryDoc(value: unknown): MemoryDoc {
  if (
    !isRecord(value) ||
    (typeof value.id !== 'string' && typeof value.id !== 'number') ||
    typeof value.scope !== 'string' ||
    typeof value.slot !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('[frogbot] memory: a stored memory is malformed');
  }

  return {
    id: value.id,
    scope: value.scope,
    key: typeof value.key === 'string' ? value.key : null,
    slot: value.slot,
    text: value.text,
    pinned: value.pinned === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function memoryBucket({ namespace, scopeId }: MemoryTarget): string {
  return JSON.stringify([namespace, scopeId]);
}

export function inBucket(target: MemoryTarget, ...where: Where[]): Where {
  return { and: [{ bucket: { equals: memoryBucket(target) } }, ...where] };
}

export function toMemory(doc: MemoryDoc): Memory {
  return {
    id: String(doc.id),
    scope: doc.scope,
    ...(doc.key ? { key: doc.key } : {}),
    text: doc.text,
    pinned: doc.pinned === true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function payloadOf(target: MemoryTarget): { payload: Payload; req: PayloadRequest } {
  const req = toPayloadRequest(target.req);

  return { payload: req.payload, req };
}

export async function findMemories({ target, where, ...options }: FindArgs) {
  const { payload, req } = payloadOf(target);

  const result = await payload.find({
    collection: MEMORIES_SLUG,
    where: inBucket(target, ...(where ? [where] : [])),
    depth: 0,
    overrideAccess: true,
    req,
    ...options,
  });

  return { ...result, docs: result.docs.map(toMemoryDoc) };
}

export async function findMemory(
  target: MemoryTarget,
  where: Where,
): Promise<MemoryDoc | undefined> {
  const { docs } = await findMemories({ target, where, limit: 1, pagination: false });

  return docs[0];
}

function isValidID(payload: Payload, id: string): boolean {
  if (payload.db.defaultIDType === 'number') return /^\d+$/.test(id);

  if (payload.db.name === 'mongoose') return /^[a-f\d]{24}$/i.test(id);

  return true;
}

/** The memory with this id in the target's scope, or `not-found`. */
export async function findOwnedMemory(target: MemoryTarget, id: string): Promise<MemoryDoc> {
  const doc = isValidID(payloadOf(target).payload, id)
    ? await findMemory(target, { id: { equals: id } })
    : undefined;

  if (!doc) {
    throw new MemoryAdapterError(
      'not-found',
      `Memory '${id}' was not found in scope '${target.scope}'.`,
    );
  }

  return doc;
}
